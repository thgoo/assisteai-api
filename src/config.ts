// The only module that reads the environment. Everything else receives what it needs from the composition root.
import { z } from 'zod';
import type { LogFormat, LogLevel } from '~/logger';
import { LOG_LEVELS } from '~/logger';

const commaSeparated = z.string().transform(value => value.split(',').map(item => item.trim()).filter(Boolean));

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const envSchema = databaseEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  /** Frontend origins allowed by CORS. Server-side rendering calls don't need CORS. */
  CORS_ORIGINS: commaSeparated.pipe(z.array(z.url()).min(1)),
});

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  log: { level: LogLevel; format: LogFormat };
  corsOrigins: string[];
  database: DatabaseConfig;
}

export interface DatabaseConfig {
  url: string;
}

/** Only the database settings, for tools that don't serve HTTP (migrations, seed, ETL). */
export function loadDatabaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConfig {
  return { url: parse(databaseEnvSchema, env).DATABASE_URL };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const { NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS, DATABASE_URL } = parse(envSchema, env);
  const isProduction = NODE_ENV === 'production';
  return {
    env: NODE_ENV,
    port: PORT,
    log: {
      level: LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
      format: isProduction ? 'json' : 'pretty',
    },
    corsOrigins: CORS_ORIGINS,
    database: { url: DATABASE_URL },
  };
}

/** Empty values (`LOG_LEVEL=` in a .env file) count as unset, so defaults apply. */
function parse<T extends z.ZodType>(schema: T, env: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')));
  if (!result.success) throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  return result.data;
}
