// Composition root: the only place that builds the shared instances and wires them together.
import { createApp } from '~/app';
import { GoogleClient } from '~/auth/google-client';
import { LegacyJwt, REFRESH_WINDOW_SECONDS, TOKEN_TTL_SECONDS } from '~/auth/legacy-jwt';
import { RevokedTokenRepository } from '~/auth/revoked-token-repository';
import { TokenService } from '~/auth/token-service';
import { UserRepository } from '~/auth/user-repository';
import { loadConfig } from '~/config';
import { createDatabase } from '~/db/client';
import { ConsoleLogger } from '~/logger';
import { MovieService } from '~/movies/movie-service';

const config = loadConfig();
const logger = new ConsoleLogger(config.log);
const database = createDatabase(config.database.url);
const { db } = database;

const app = createApp({
  logger,
  corsOrigins: config.corsOrigins,
  movieService: new MovieService(db),
  tokenService: new TokenService(
    new LegacyJwt({ secret: config.jwtSecret, ttlSeconds: TOKEN_TTL_SECONDS }),
    new RevokedTokenRepository(db),
    { refreshWindowSeconds: REFRESH_WINDOW_SECONDS },
  ),
  googleClient: new GoogleClient({ baseUrl: config.googleApiUrl, timeoutMs: 5000 }),
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
