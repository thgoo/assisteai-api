import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import type { Logger } from '~/logger';
import { errorHandler, notFound } from '~/http/errors';
import { requestLogger } from '~/logger';

export interface AppDependencies {
  logger: Logger;
  corsOrigins: readonly string[];
}

/** Builds the HTTP app from its collaborators. Wiring them up is `index.ts`'s job, so tests can pass their own. */
export function createApp({ logger, corsOrigins }: AppDependencies): Hono {
  const app = new Hono();

  app.use(requestId());
  app.use(requestLogger(logger));
  // The frontend sends the token in the Authorization header, never cookies, so no credentials (Q-05).
  app.use(cors({
    origin: [...corsOrigins],
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  }));

  app.get('/health', c => c.json({ status: 'ok' }));

  app.notFound(notFound);
  app.onError(errorHandler(logger));

  return app;
}
