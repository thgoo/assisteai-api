import { describe, expect, test } from 'bun:test';
import { request } from './support/http';
import { statusErrorSchema } from './support/schemas';
import { byTarget } from './support/target';

const FRONT_ORIGIN = 'https://assisteai.com.br';

describe('HTTP conventions', () => {
  test('an unknown route: 404 HTTP_NOT_FOUND', async () => {
    const response = await request('GET', '/no-such-route');

    expect(response.status).toBe(404);
    expect(statusErrorSchema.parse(response.body)).toEqual({ success: false, status: 404, message: 'HTTP_NOT_FOUND' });
  });

  // Nothing calls an endpoint with the wrong method, so the new app doesn't special-case it (Q-26).
  test('a known route with the wrong method: 405 on legacy, 404 on the new app', async () => {
    const response = await request('DELETE', '/movies');
    const status = byTarget({ legacy: 405, new: 404 });

    expect(response.status).toBe(status);
    expect(statusErrorSchema.parse(response.body)).toEqual({
      success: false,
      status,
      message: byTarget({ legacy: 'HTTP_METHOD_NOT_ALLOWED', new: 'HTTP_NOT_FOUND' }),
    });
  });

  describe('CORS (Q-05: legacy allows any origin, the new app only the frontend)', () => {
    test('the frontend origin is allowed, error responses included', async () => {
      const response = await request('GET', '/no-such-route', { headers: { Origin: FRONT_ORIGIN } });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(byTarget({ legacy: '*', new: FRONT_ORIGIN }));
    });

    test('other origins are not allowed on the new app', async () => {
      const response = await request('GET', '/no-such-route', { headers: { Origin: 'https://example.com' } });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(byTarget({ legacy: '*', new: null }));
    });

    // Q-04: legacy answers 200 with a JSON string as the body.
    test('preflight allows POST with the Authorization header', async () => {
      const response = await request('OPTIONS', '/movies/ratings', {
        headers: {
          'Origin': FRONT_ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });

      expect(response.status).toBe(byTarget({ legacy: 200, new: 204 }));
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('authorization');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });
  });
});
