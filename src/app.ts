import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import type { AuthRoutesDependencies } from '~/auth/routes';
import type { Logger } from '~/logger';
import type { MovieService } from '~/movies/movie-service';
import { createAuthRoutes } from '~/auth/routes';
import { errorHandler, notFound } from '~/http/errors';
import { requestLogger } from '~/logger';
import { createMovieRoutes } from '~/movies/routes';

export interface AppDependencies extends AuthRoutesDependencies {
  logger: Logger;
  corsOrigins: readonly string[];
  movieService: MovieService;
}

/** Builds the HTTP app from its collaborators. Wiring them up is `index.ts`'s job, so tests can pass their own. */
export function createApp({ logger, corsOrigins, movieService, ...auth }: AppDependencies): Hono {
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
  app.route('/auth', createAuthRoutes(auth));
  app.route('/movies', createMovieRoutes({ movieService }));

  app.notFound(notFound);
  app.onError(errorHandler(logger));

  return app;
}
