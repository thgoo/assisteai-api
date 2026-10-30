// Composition root: the only place that builds the shared instances and wires them together.
import { sql } from 'drizzle-orm';
import { createApp } from '~/app';
import { GoogleIdTokenVerifier } from '~/auth/google-id-token-verifier';
import { SessionService } from '~/auth/session-service';
import { UserRepository } from '~/auth/user-repository';
import { loadConfig } from '~/config';
import { createDatabase } from '~/db/client';
import { SessionCookie } from '~/http/session-cookie';
import { TelegramClient } from '~/integrations/telegram/telegram-client';
import { TmdbClient } from '~/integrations/tmdb/tmdb-client';
import { ConsoleLogger } from '~/logger';
import { MovieResolver } from '~/movies/movie-resolver';
import { MovieService } from '~/movies/movie-service';
import { NoopRatingNotifier, TelegramRatingNotifier } from '~/ratings/rating-notifier';
import { RatingService } from '~/ratings/rating-service';
import { TitleSearchService } from '~/titles/title-search-service';
import { UserDirectory } from '~/users/user-directory';

/** Searching costs one TMDb call and happens while typing, so it gets more room than rating or signing in. */
const SEARCHES_PER_RATE_LIMIT_UNIT = 4;

/** Sessions end after 30 days without use. */
const SESSION_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

const config = loadConfig();
const logger = new ConsoleLogger(config.log);
const database = createDatabase(config.database.url);
const { db } = database;

const tmdb = new TmdbClient({ ...config.tmdb, timeoutMs: 5000 });
const ratingNotifier = config.telegram
  ? new TelegramRatingNotifier(new TelegramClient({ ...config.telegram, timeoutMs: 5000 }), config.frontendUrl, logger)
  : new NoopRatingNotifier();
if (!config.telegram) logger.warn('Telegram is not configured: new ratings won\'t be posted');

const app = createApp({
  logger,
  corsOrigins: config.corsOrigins,
  ratingsPerMinute: config.rateLimitPerMinute,
  signInsPerMinute: config.rateLimitPerMinute,
  searchesPerMinute: config.rateLimitPerMinute * SEARCHES_PER_RATE_LIMIT_UNIT,
  checkHealth: async () => {
    await db.execute(sql`SELECT 1`);
  },
  movieService: new MovieService(db),
  ratingService: new RatingService(db, new MovieResolver(db, tmdb), ratingNotifier),
  titleSearchService: new TitleSearchService(db, tmdb, logger),
  userDirectory: new UserDirectory(db),
  googleIdTokenVerifier: new GoogleIdTokenVerifier({ ...config.google, timeoutMs: 5000 }),
  sessionService: new SessionService(db, { idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS }),
  sessionCookie: new SessionCookie({ domain: config.sessionCookieDomain }),
  userRepository: new UserRepository(db),
});

const server = Bun.serve({ hostname: config.host, port: config.port, fetch: app.fetch });
logger.info('Listening', { url: server.url.href, env: config.env });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('Shutting down: finishing in-flight requests', { signal });
    void server.stop()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
}
