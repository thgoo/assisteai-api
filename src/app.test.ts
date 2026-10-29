import { describe, expect, mock, test } from 'bun:test';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from '~/logger';
import { ConsoleLogger } from '~/logger';
import { testSettings, unusedServices } from '~/test-support/unused-services';
import { createApp } from './app';
import { ProblemError } from './http/errors';

function appThatThrows(error: Error) {
  const logError = mock();
  const logger: Logger = { debug: mock(), info: mock(), warn: mock(), error: logError, child: () => logger };
  const app = createApp({ logger, corsOrigins: ['https://assisteai.com.br'], ...unusedServices, ...testSettings });
  app.get('/throws', () => {
    throw error;
  });
  return { app, logError };
}

async function problemOf(response: Response) {
  expect(response.headers.get('Content-Type')).toBe('application/problem+json');
  return response.json();
}

describe('error handling', () => {
  test('ProblemError: its status, detail and field errors', async () => {
    const errors = [{ path: 'url', message: 'Informe o link.' }];
    const { app } = appThatThrows(new ProblemError(422, 'Informe o link.', errors));
    const response = await app.request('/throws');

    expect(response.status).toBe(422);
    expect(await problemOf(response)).toEqual({
      type: 'about:blank', title: 'Unprocessable Entity', status: 422, detail: 'Informe o link.', errors,
    });
  });

  test('HTTPException: a problem with the standard title', async () => {
    const { app } = appThatThrows(new HTTPException(401));
    const response = await app.request('/throws');

    expect(response.status).toBe(401);
    expect(await problemOf(response)).toEqual({ type: 'about:blank', title: 'Unauthorized', status: 401 });
  });

  test('anything else: a logged 500 that leaks nothing', async () => {
    const error = new Error('secret details');
    const { app, logError } = appThatThrows(error);
    const response = await app.request('/throws');

    expect(response.status).toBe(500);
    expect(await problemOf(response)).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500 });
    expect(logError).toHaveBeenCalledWith('Unhandled error', { method: 'GET', path: '/throws', error });
  });

  test('unknown routes: 404 problem', async () => {
    const { app } = appThatThrows(new Error('unused'));
    const response = await app.request('/nope');

    expect(response.status).toBe(404);
    expect(await problemOf(response)).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  test('error responses keep the CORS headers, with credentials', async () => {
    const { app } = appThatThrows(new Error('boom'));
    const response = await app.request('/throws', { headers: { Origin: 'https://assisteai.com.br' } });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://assisteai.com.br');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});

describe('operations', () => {
  function app(checkHealth: () => Promise<void>) {
    const logger = new ConsoleLogger({ level: 'error', format: 'json' });
    const instance = createApp({
      logger, corsOrigins: ['https://assisteai.com.br'], ...unusedServices, ...testSettings, checkHealth,
    });
    instance.post('/echo', async c => c.json(await c.req.json()));
    return instance;
  }

  test('/health: 200 while the database answers, 503 when it doesn\'t', async () => {
    expect((await app(() => Promise.resolve()).request('/health')).status).toBe(200);

    const down = await app(() => Promise.reject(new Error('connection refused'))).request('/health');
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ status: 503, detail: 'Banco de dados indisponível.' });
  });

  test('bodies over 16 KB: 413 problem', async () => {
    const response = await app(() => Promise.resolve()).request('/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(17 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ status: 413, title: 'Payload Too Large' });
  });

  test('security headers on every response', async () => {
    const { headers } = await app(() => Promise.resolve()).request('/health');

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headers.get('Strict-Transport-Security')).toContain('max-age=');
    expect(headers.get('Cross-Origin-Resource-Policy')).toBe('same-site');
  });
});
