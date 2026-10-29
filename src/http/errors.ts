// Errors are RFC 9457 problem details (`application/problem+json`). `detail` is written for the end user (pt-BR) when
// the frontend shows it.
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { STATUS_CODES } from 'node:http';
import type { Logger } from '~/logger';

export interface ProblemFieldError {
  path: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: ContentfulStatusCode;
  detail?: string;
  errors?: ProblemFieldError[];
}

/** Throw it from a handler or service to answer with a problem, e.g. `new ProblemError(409, 'Você já avaliou…')`. */
export class ProblemError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly detail?: string,
    readonly errors?: ProblemFieldError[],
  ) {
    super(detail ?? STATUS_CODES[status]);
    this.name = 'ProblemError';
  }
}

export function problem(status: ContentfulStatusCode, detail?: string, errors?: ProblemFieldError[]): Problem {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(errors === undefined ? {} : { errors }),
  };
}

export function problemResponse(c: Context, body: Problem): Response {
  return c.body(JSON.stringify(body), body.status, { 'Content-Type': 'application/problem+json' });
}

export const notFound: NotFoundHandler = c => problemResponse(c, problem(404));

/** Never leaks internals: anything unexpected is a logged 500 without details. */
export function errorHandler(logger: Logger): ErrorHandler {
  return (error, c) => {
    if (error instanceof ProblemError) return problemResponse(c, problem(error.status, error.detail, error.errors));
    if (error instanceof HTTPException && error.status < 500) return problemResponse(c, problem(error.status));

    logger.child({ requestId: c.get('requestId') }).error('Unhandled error', {
      method: c.req.method,
      path: c.req.path,
      error,
    });
    return problemResponse(c, problem(500));
  };
}
