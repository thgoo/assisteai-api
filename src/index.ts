// Composition root: the only place that builds the shared instances and wires them together.
import { createApp } from '~/app';
import { loadConfig } from '~/config';
import { ConsoleLogger } from '~/logger';

const config = loadConfig();
const logger = new ConsoleLogger(config.log);
const app = createApp({ logger, corsOrigins: config.corsOrigins });

const server = Bun.serve({ port: config.port, fetch: app.fetch });
logger.info('Listening', { url: server.url.href, env: config.env });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('Shutting down: finishing in-flight requests', { signal });
    void server.stop().then(() => process.exit(0));
  });
}
