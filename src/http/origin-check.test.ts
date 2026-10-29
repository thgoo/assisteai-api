import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { ConsoleLogger } from '~/logger';
import { errorHandler } from './errors';
import { originCheck } from './origin-check';

const app = new Hono()
  .use(originCheck(['https://assisteai.com.br']))
  .all('/', c => c.text('ok'))
  .onError(errorHandler(new ConsoleLogger({ level: 'error', format: 'json' })));

describe('originCheck', () => {
  test.each([
    ['POST from the frontend', 'POST', 'https://assisteai.com.br', 200],
    ['POST from another site', 'POST', 'https://evil.example', 403],
    ['POST without Origin (server-side call)', 'POST', undefined, 200],
    ['GET from another site', 'GET', 'https://evil.example', 200],
  ])('%s → %i', async (_, method, origin, status) => {
    const response = await app.request('/', { method, headers: origin === undefined ? {} : { Origin: origin } });
    expect(response.status).toBe(status);
  });
});
