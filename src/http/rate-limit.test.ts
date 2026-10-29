import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { ConsoleLogger } from '~/logger';
import { errorHandler } from './errors';
import { clientIp, rateLimit } from './rate-limit';

function limitedApp(max: number) {
  let time = 0;
  const app = new Hono()
    .use(rateLimit({ max, windowMs: 60_000, key: c => c.req.header('X-User'), now: () => time }))
    .get('/', c => c.text('ok'))
    .onError(errorHandler(new ConsoleLogger({ level: 'error', format: 'json' })));
  return {
    request: (user?: string) => app.request('/', { headers: user ? { 'X-User': user } : {} }),
    tick: (ms: number) => {
      time += ms;
    },
  };
}

describe('rateLimit', () => {
  test('allows `max` requests per window, then 429 with Retry-After', async () => {
    const { request, tick } = limitedApp(2);
    expect((await request('ana')).status).toBe(200);
    tick(10_000);
    expect((await request('ana')).status).toBe(200);

    const limited = await request('ana');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('50');
    expect(await limited.json()).toMatchObject({ detail: 'Muitas tentativas. Tente de novo em instantes.' });
  });

  test('counts each key separately and starts over after the window', async () => {
    const { request, tick } = limitedApp(1);
    expect((await request('ana')).status).toBe(200);
    expect((await request('bruno')).status).toBe(200);
    expect((await request('ana')).status).toBe(429);

    tick(60_000);
    expect((await request('ana')).status).toBe(200);
  });

  test('requests without a key are not limited', async () => {
    const { request } = limitedApp(1);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
  });
});

describe('clientIp', () => {
  const app = new Hono().get('/', c => c.text(clientIp(c) ?? 'none'));

  test.each([
    [{ 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '10.0.0.1' }, '203.0.113.7'],
    [{ 'X-Forwarded-For': '198.51.100.2, 10.0.0.1' }, '198.51.100.2'],
    [{}, 'none'],
  ])('%j → %s', async (headers, ip) => {
    expect(await (await app.request('/', { headers })).text()).toBe(ip);
  });
});
