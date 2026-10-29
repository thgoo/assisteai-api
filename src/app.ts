import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import type { Logger } from '~/logger';
import type { MovieService } from '~/movies/movie-service';
import { errorHandler, notFound } from '~/http/errors';
import { requestLogger } from '~/logger';
import { createMovieRoutes } from '~/movies/routes';

export interface AppDependencies {
  logger: Logger;
  corsOrigins: readonly string[];
  movieService: MovieService;
}

/** Builds the HTTP app from its collaborators. Wiring them up is `index.ts`'s job, so tests can pass their own. */
export function createApp({ logger, corsOrigins, movieService }: AppDependencies): Hono {
  const app = new Hono();

  app.use(requestId());
  app.use(requestLogger(logger));
  // The session cookie needs credentialed CORS, so origins are an explicit list.
  app.use(cors({
    origin: [...corsOrigins],
    credentials: true,
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  }));

  app.get('/health', c => c.json({ status: 'ok' }));
  app.route('/movies', createMovieRoutes({ movieService }));

  app.notFound(notFound);
  app.onError(errorHandler(logger));

  return app;
}
