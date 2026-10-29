// Composition root: the only place that builds the shared instances and wires them together.
import { createApp } from '~/app';
import { GoogleIdTokenVerifier } from '~/auth/google-id-token-verifier';
import { SessionService } from '~/auth/session-service';
import { UserRepository } from '~/auth/user-repository';
import { loadConfig } from '~/config';
import { createDatabase } from '~/db/client';
import { SessionCookie } from '~/http/session-cookie';
import { ConsoleLogger } from '~/logger';
import { MovieService } from '~/movies/movie-service';

/** Sessions end after 30 days without use. */
const SESSION_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

const config = loadConfig();
const logger = new ConsoleLogger(config.log);
const database = createDatabase(config.database.url);
const { db } = database;

const app = createApp({
  logger,
  corsOrigins: config.corsOrigins,
  movieService: new MovieService(db),
  googleIdTokenVerifier: new GoogleIdTokenVerifier({ ...config.google, timeoutMs: 5000 }),
  sessionService: new SessionService(db, { idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS }),
  sessionCookie: new SessionCookie({ domain: config.sessionCookieDomain }),
  userRepository: new UserRepository(db),
});

const server = Bun.serve({ port: config.port, fetch: app.fetch });
logger.info('Listening', { url: server.url.href, env: config.env });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('Shutting down: finishing in-flight requests', { signal });
    void server.stop()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
}
