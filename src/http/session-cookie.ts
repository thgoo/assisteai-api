import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { NewSession, SessionService } from '~/auth/session-service';
import { ProblemError } from './errors';

const COOKIE_NAME = 'session';

export interface SessionCookieOptions {
  /** `.assisteai.com.br` in production, so the frontend's server-side calls carry the cookie too. Unset: host-only. */
  domain?: string;
}

/** Routes behind `requireSession` read the signed-in user with `c.get('userId')`. */
export interface SessionEnv {
  Variables: { userId: number; sessionToken: string };
}

export class SessionCookie {
  constructor(private readonly options: SessionCookieOptions) {}

  read(c: Context): string | undefined {
    return getCookie(c, COOKIE_NAME);
  }

  write(c: Context, { token, expiresAt }: NewSession): void {
    setCookie(c, COOKIE_NAME, token, { ...this.attributes(), expires: expiresAt });
  }

  clear(c: Context): void {
    deleteCookie(c, COOKIE_NAME, this.attributes());
  }

  private attributes() {
    return { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', domain: this.options.domain } as const;
  }
}

const SIGN_IN_REQUIRED = 'Faça login para continuar.';

/** 401 unless the request carries a live session. */
export function requireSession(cookie: SessionCookie, sessions: SessionService): MiddlewareHandler<SessionEnv> {
  return async (c, next) => {
    const token = cookie.read(c);
    const userId = token === undefined ? undefined : await sessions.authenticate(token);
    if (userId === undefined || token === undefined) throw new ProblemError(401, SIGN_IN_REQUIRED);

    c.set('userId', userId);
    c.set('sessionToken', token);
    await next();
  };
}

/** The signed-in user's id, for a public route where one option needs a session; 401 without a live one. */
export async function signedInUserId(c: Context, cookie: SessionCookie, sessions: SessionService): Promise<number> {
  const token = cookie.read(c);
  const userId = token === undefined ? undefined : await sessions.authenticate(token);
  if (userId === undefined) throw new ProblemError(401, SIGN_IN_REQUIRED);
  return userId;
}
