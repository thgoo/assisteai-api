// The legacy API has two error bodies (doc 01 §3), and the frontend relies on both:
// - `{ success: false, status, message: 'HTTP_NOT_FOUND' }` for HTTP-level failures (routing, auth, crashes);
// - `{ success: false, message }` for failures shown to the user, with a pt-BR message.
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { STATUS_CODES } from 'node:http';
import type { Logger } from '~/logger';

/** A failure whose message is shown to the user, e.g. `new ApiError(409, 'Você já avaliou esse filme.')`. */
export class ApiError extends Error {
  constructor(readonly status: ContentfulStatusCode, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Symfony's constant names, as legacy sends them: 404 → `HTTP_NOT_FOUND`, 422 → `HTTP_UNPROCESSABLE_ENTITY`. */
export function statusMessage(status: number): string {
  const reason = STATUS_CODES[status] ?? 'Internal Server Error';
  return `HTTP_${reason.toUpperCase().replace(/\W+/g, '_')}`;
}

export function statusError(c: Context, status: ContentfulStatusCode): Response {
  return c.json({ success: false, status, message: statusMessage(status) }, status);
}

export const notFound: NotFoundHandler = c => statusError(c, 404);

/** Never leaks error details to clients: anything unexpected is a logged 500. */
export function errorHandler(logger: Logger): ErrorHandler {
  return (error, c) => {
    if (error instanceof ApiError) return c.json({ success: false, message: error.message }, error.status);
    if (error instanceof HTTPException && error.status < 500) return statusError(c, error.status);

    logger.child({ requestId: c.get('requestId') }).error('Unhandled error', {
      method: c.req.method,
      path: c.req.path,
      error,
    });
    return statusError(c, 500);
  };
}
