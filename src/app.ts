import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import type { AuthDependencies } from '~/auth/routes';
import type { Logger } from '~/logger';
import type { MovieService } from '~/movies/movie-service';
import type { RatingService } from '~/ratings/rating-service';
import { createAuthRoutes } from '~/auth/routes';
import { errorHandler, notFound } from '~/http/errors';
import { originCheck } from '~/http/origin-check';
import { requestLogger } from '~/logger';
import { createMovieRoutes } from '~/movies/routes';
import { createRatingRoutes } from '~/ratings/routes';

export interface AppDependencies extends AuthDependencies {
  logger: Logger;
  corsOrigins: readonly string[];
  movieService: MovieService;
  ratingService: RatingService;
}

/** Builds the HTTP app from its collaborators. Wiring them up is `index.ts`'s job, so tests can pass their own. */
export function createApp({ logger, corsOrigins, movieService, ratingService, ...auth }: AppDependencies): Hono {
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
  app.use(originCheck(corsOrigins));

  app.get('/health', c => c.json({ status: 'ok' }));
  app.route('/', createAuthRoutes(auth));
  app.route('/movies', createMovieRoutes({ movieService }));
  app.route('/ratings', createRatingRoutes({ ratingService, ...auth }));

  app.notFound(notFound);
  app.onError(errorHandler(logger));

  return app;
}
