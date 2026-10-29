import { describe, expect, test } from 'bun:test';
import { request } from './support/http';
import { problemSchema } from './support/schemas';

const FRONT_ORIGIN = 'https://assisteai.com.br';

describe('HTTP conventions', () => {
  test('an unknown route: 404 problem+json', async () => {
    const response = await request('GET', '/no-such-route');

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(problemSchema.parse(response.body)).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  test('a known route with the wrong method: 404', async () => {
    expect((await request('DELETE', '/movies')).status).toBe(404);
  });

  test('health check', async () => {
    const response = await request('GET', '/health');
    expect(response.body).toEqual({ status: 'ok' });
  });

  describe('CORS: only the frontend origins, with credentials (session cookie)', () => {
    test('the frontend origin is allowed, error responses included', async () => {
      const response = await request('GET', '/no-such-route', { headers: { Origin: FRONT_ORIGIN } });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(FRONT_ORIGIN);
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    test('other origins are not allowed', async () => {
      const response = await request('GET', '/no-such-route', { headers: { Origin: 'https://example.com' } });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    test('preflight allows POST with a JSON body', async () => {
      const response = await request('OPTIONS', '/ratings', {
        headers: {
          'Origin': FRONT_ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('content-type');
    });
  });
});
