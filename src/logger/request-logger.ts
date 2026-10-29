import type { MiddlewareHandler } from 'hono';
import type { Logger } from './types';

/** One access log entry per request. Expects the `requestId` middleware to run first. */
export function requestLogger(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    await next();

    logger.child({ requestId: c.get('requestId') }).info(`${c.req.method} ${c.req.path}`, {
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    });
  };
}
