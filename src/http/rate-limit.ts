import type { Context, Env, MiddlewareHandler } from 'hono';
import { ProblemError } from './errors';

export interface RateLimitOptions<E extends Env> {
  /** Requests allowed per key within one window. */
  max: number;
  windowMs: number;
  /** Who is being limited (a user id, a client IP). Requests without a key aren't limited. */
  key: (c: Context<E>) => string | undefined;
  now?: () => number;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Sweep expired windows once the map gets this big, so it can't grow without bound. */
const SWEEP_THRESHOLD = 10_000;

/**
 * Fixed-window rate limiting in memory. Fine for a single process (the API runs as one); several processes would each
 * keep their own counts. Over the limit: 429 with `Retry-After`.
 */
export function rateLimit<E extends Env>(options: RateLimitOptions<E>): MiddlewareHandler<E> {
  const { max, windowMs, key, now = Date.now } = options;
  const windows = new Map<string, Window>();

  return async (c, next) => {
    const id = key(c);
    if (id === undefined) return next();

    const time = now();
    if (windows.size >= SWEEP_THRESHOLD) {
      for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
    }

    let window = windows.get(id);
    if (!window || window.resetAt <= time) {
      window = { count: 0, resetAt: time + windowMs };
      windows.set(id, window);
    }
    window.count += 1;

    if (window.count > max) {
      c.header('Retry-After', String(Math.ceil((window.resetAt - time) / 1000)));
      throw new ProblemError(429, 'Muitas tentativas. Tente de novo em instantes.');
    }
    await next();
  };
}

/**
 * The client's IP as seen by Cloudflare (`CF-Connecting-IP`), else the first `X-Forwarded-For` hop (nginx), else the
 * socket's peer. The headers are only trustworthy because the API listens on 127.0.0.1 behind the proxy.
 */
export function clientIp(c: Context): string | undefined {
  const forwarded = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  // Bun passes its server as the env; `app.request()` in unit tests has none.
  const server = c.env as Partial<Pick<Bun.Server<undefined>, 'requestIP'>> | undefined;
  return server?.requestIP?.(c.req.raw)?.address;
}
