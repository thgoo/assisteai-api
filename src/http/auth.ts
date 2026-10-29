import type { MiddlewareHandler } from 'hono';
import type { TokenService } from '~/auth/token-service';
import { statusError } from './errors';

/** Routes behind `requireAuth` read the authenticated user's id with `c.get('userId')`. */
export interface AuthEnv {
  Variables: { userId: number };
}

/** The frontend only sends tokens in the Authorization header (doc 01 §8), so that's the only place we look. */
export function bearerToken(authorization: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  return match?.[1];
}

/** 401 `HTTP_UNAUTHORIZED` (the legacy body) unless the request carries a valid token. */
export function requireAuth(tokenService: TokenService): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = bearerToken(c.req.header('Authorization'));
    const userId = token === undefined ? undefined : await tokenService.authenticate(token);
    if (userId === undefined) return statusError(c, 401);

    c.set('userId', userId);
    await next();
  };
}
