import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { AuthDependencies } from '~/auth/routes';
import type { Logger } from '~/logger';
import type { MovieService } from '~/movies/movie-service';
import type { RatingService } from '~/ratings/rating-service';
import type { TitleSearchService } from '~/titles/title-search-service';
import { createAuthRoutes } from '~/auth/routes';
import { errorHandler, notFound, ProblemError, problem, problemResponse } from '~/http/errors';
import { originCheck } from '~/http/origin-check';
import { requestLogger } from '~/logger';
import { createMovieRoutes } from '~/movies/routes';
import { createRatingRoutes } from '~/ratings/routes';
import { createTitleRoutes } from '~/titles/routes';

export interface AppDependencies extends AuthDependencies {
  logger: Logger;
  corsOrigins: readonly string[];
  movieService: MovieService;
  ratingService: RatingService;
  titleSearchService: TitleSearchService;
  ratingsPerMinute: number;
  searchesPerMinute: number;
  /** Resolves when the app can serve requests (the database answers); rejects otherwise. */
  checkHealth: () => Promise<void>;
}

/** Every request body is a small JSON object. */
const MAX_BODY_BYTES = 16 * 1024;

/** Builds the HTTP app from its collaborators. Wiring them up is `index.ts`'s job, so tests can pass their own. */
export function createApp(deps: AppDependencies): Hono {
  const {
    logger, corsOrigins, movieService, ratingService, titleSearchService, ratingsPerMinute, searchesPerMinute,
    checkHealth, ...auth
  } = deps;
  const app = new Hono();

  app.use(requestId());
  app.use(requestLogger(logger));
  // A JSON API used from the frontend's origins: same-site resource policy, no framing, no sniffing, HSTS.
  app.use(secureHeaders({ crossOriginResourcePolicy: 'same-site' }));
  app.use(bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new ProblemError(413);
    },
  }));
  // The session cookie needs credentialed CORS, so origins are an explicit list.
  app.use(cors({
    origin: [...corsOrigins],
    credentials: true,
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  }));
  app.use(originCheck(corsOrigins));

  app.get('/health', async c => {
    try {
      await checkHealth();
      return c.json({ status: 'ok' });
    } catch (error) {
      logger.error('Health check failed', { error });
      return problemResponse(c, problem(503, 'Banco de dados indisponível.'));
    }
  });
  app.route('/', createAuthRoutes(auth));
  app.route('/movies', createMovieRoutes({ movieService }));
  app.route('/ratings', createRatingRoutes({ ratingService, ratingsPerMinute, ...auth }));
  app.route('/titles', createTitleRoutes({ titleSearchService, searchesPerMinute, ...auth }));

  app.notFound(notFound);
  app.onError(errorHandler(logger));

  return app;
}
