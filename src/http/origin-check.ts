import type { MiddlewareHandler } from 'hono';
import { ProblemError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection on top of `SameSite=Lax`: a state-changing request from a browser page (it has an `Origin`) must
 * come from one of the frontend origins. Requests without `Origin` aren't from a cross-site page.
 */
export function originCheck(allowedOrigins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedOrigins);
  return async (c, next) => {
    const origin = c.req.header('Origin');
    if (!SAFE_METHODS.has(c.req.method) && origin !== undefined && !allowed.has(origin)) {
      throw new ProblemError(403, 'Origem não permitida.');
    }
    await next();
  };
}
