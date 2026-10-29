import { describe, expect, mock, test } from 'bun:test';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from '~/logger';
import type { MovieService } from '~/movies/movie-service';
import { createApp } from './app';
import { ApiError, statusMessage } from './http/errors';

function appThatThrows(error: Error) {
  const logError = mock();
  const logger: Logger = { debug: mock(), info: mock(), warn: mock(), error: logError, child: () => logger };
  const app = createApp({
    logger,
    corsOrigins: ['https://assisteai.com.br'],
    movieService: {} as MovieService,
  });
  app.get('/throws', () => {
    throw error;
  });
  return { app, logError };
}

describe('statusMessage', () => {
  test.each([
    [401, 'HTTP_UNAUTHORIZED'],
    [404, 'HTTP_NOT_FOUND'],
    [405, 'HTTP_METHOD_NOT_ALLOWED'],
    [422, 'HTTP_UNPROCESSABLE_ENTITY'],
    [500, 'HTTP_INTERNAL_SERVER_ERROR'],
  ])('%i → %s', (status, message) => {
    expect(statusMessage(status)).toBe(message);
  });
});

describe('error handling', () => {
  test('ApiError: its status and the user-facing message', async () => {
    const { app } = appThatThrows(new ApiError(409, 'Você já avaliou esse filme.'));
    const response = await app.request('/throws');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, message: 'Você já avaliou esse filme.' });
  });

  test('HTTPException: the legacy status body', async () => {
    const { app } = appThatThrows(new HTTPException(401));
    const response = await app.request('/throws');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, status: 401, message: 'HTTP_UNAUTHORIZED' });
  });

  test('anything else: a logged 500 that leaks nothing', async () => {
    const error = new Error('secret details');
    const { app, logError } = appThatThrows(error);
    const response = await app.request('/throws');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, status: 500, message: 'HTTP_INTERNAL_SERVER_ERROR' });
    expect(logError).toHaveBeenCalledWith('Unhandled error', { method: 'GET', path: '/throws', error });
  });

  test('error responses keep the CORS headers', async () => {
    const { app } = appThatThrows(new Error('boom'));
    const response = await app.request('/throws', { headers: { Origin: 'https://assisteai.com.br' } });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://assisteai.com.br');
  });
});
