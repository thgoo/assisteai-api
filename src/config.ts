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
  /** Shared with the legacy app, so tokens work on both. lcobucci/jwt (legacy) refuses HS256 keys under 256 bits. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 bytes (256 bits)'),
  /** Overridable so tests can point it at the mock. */
  GOOGLE_API_URL: z.url().default('https://www.googleapis.com'),
});

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  log: { level: LogLevel; format: LogFormat };
  corsOrigins: string[];
  database: DatabaseConfig;
  jwtSecret: string;
  googleApiUrl: string;
}

export interface DatabaseConfig {
  url: string;
}

/** Only the database settings, for tools that don't serve HTTP (migrations, seed, ETL). */
export function loadDatabaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConfig {
  return { url: parse(databaseEnvSchema, env).DATABASE_URL };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const { NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS, DATABASE_URL, JWT_SECRET, GOOGLE_API_URL } = parse(envSchema, env);
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
    jwtSecret: JWT_SECRET,
    googleApiUrl: GOOGLE_API_URL,
  };
}

/** Empty values (`LOG_LEVEL=` in a .env file) count as unset, so defaults apply. */
function parse<T extends z.ZodType>(schema: T, env: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')));
  if (!result.success) throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  return result.data;
}
