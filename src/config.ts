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
  /** Frontend origins allowed by CORS and by the CSRF origin check. */
  CORS_ORIGINS: commaSeparated.pipe(z.array(z.url()).min(1)),
  /** The OAuth client the frontend signs in with (Google ID tokens must be issued for it). */
  GOOGLE_CLIENT_ID: z.string().endsWith('.apps.googleusercontent.com'),
  /** Overridable so tests can point it at the mock. */
  GOOGLE_JWKS_URL: z.url().default('https://www.googleapis.com/oauth2/v3/certs'),
  /** e.g. `.assisteai.com.br`; unset → a host-only cookie (local development). */
  SESSION_COOKIE_DOMAIN: z.string().optional(),
});

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  log: { level: LogLevel; format: LogFormat };
  corsOrigins: string[];
  database: DatabaseConfig;
  google: { clientId: string; jwksUrl: string };
  sessionCookieDomain: string | undefined;
}

export interface DatabaseConfig {
  url: string;
}

/** Only the database settings, for tools that don't serve HTTP (migrations, seed). */
export function loadDatabaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConfig {
  return { url: parse(databaseEnvSchema, env).DATABASE_URL };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const {
    NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS, DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_JWKS_URL, SESSION_COOKIE_DOMAIN,
  } = parse(envSchema, env);
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
    google: { clientId: GOOGLE_CLIENT_ID, jwksUrl: GOOGLE_JWKS_URL },
    sessionCookieDomain: SESSION_COOKIE_DOMAIN,
  };
}

/** Empty values (`LOG_LEVEL=` in a .env file) count as unset, so defaults apply. */
function parse<T extends z.ZodType>(schema: T, env: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')));
  if (!result.success) throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  return result.data;
}
