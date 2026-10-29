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
  /** 127.0.0.1: only nginx on the same host reaches the API (and its forwarded-IP headers can be trusted). */
  HOST: z.string().default('127.0.0.1'),
  /** Per minute: sign-ins per client IP, and ratings per user. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  /** Frontend origins allowed by CORS and by the CSRF origin check. */
  CORS_ORIGINS: commaSeparated.pipe(z.array(z.url()).min(1)),
  /** The OAuth client the frontend signs in with (Google ID tokens must be issued for it). */
  GOOGLE_CLIENT_ID: z.string().endsWith('.apps.googleusercontent.com'),
  /** Overridable so tests can point it at the mock. */
  GOOGLE_JWKS_URL: z.url().default('https://www.googleapis.com/oauth2/v3/certs'),
  /** e.g. `.assisteai.com.br`; unset → a host-only cookie (local development). */
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  /** API read access token (v4 auth). */
  TMDB_API_TOKEN: z.string().min(1),
  TMDB_API_URL: z.url().default('https://api.themoviedb.org'),
  /** Links in notifications point here. */
  FRONTEND_URL: z.url().default('https://assisteai.com.br'),
  /** New ratings are posted to this Telegram chat; without a bot token, notifications are off. */
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  TELEGRAM_API_URL: z.url().default('https://api.telegram.org'),
}).refine(env => (env.TELEGRAM_BOT_TOKEN === undefined) === (env.TELEGRAM_CHAT_ID === undefined), {
  message: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID go together',
  path: ['TELEGRAM_CHAT_ID'],
});

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  rateLimitPerMinute: number;
  log: { level: LogLevel; format: LogFormat };
  corsOrigins: string[];
  database: DatabaseConfig;
  google: { clientId: string; jwksUrl: string };
  sessionCookieDomain: string | undefined;
  tmdb: { accessToken: string; baseUrl: string };
  frontendUrl: string;
  telegram: { botToken: string; chatId: string; baseUrl: string } | undefined;
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
    NODE_ENV, PORT, HOST, RATE_LIMIT_PER_MINUTE, LOG_LEVEL, CORS_ORIGINS, DATABASE_URL,
    GOOGLE_CLIENT_ID, GOOGLE_JWKS_URL, SESSION_COOKIE_DOMAIN,
    TMDB_API_TOKEN, TMDB_API_URL, FRONTEND_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_API_URL,
  } = parse(envSchema, env);
  const isProduction = NODE_ENV === 'production';
  return {
    env: NODE_ENV,
    port: PORT,
    host: HOST,
    rateLimitPerMinute: RATE_LIMIT_PER_MINUTE,
    log: {
      level: LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
      format: isProduction ? 'json' : 'pretty',
    },
    corsOrigins: CORS_ORIGINS,
    database: { url: DATABASE_URL },
    google: { clientId: GOOGLE_CLIENT_ID, jwksUrl: GOOGLE_JWKS_URL },
    sessionCookieDomain: SESSION_COOKIE_DOMAIN,
    tmdb: { accessToken: TMDB_API_TOKEN, baseUrl: TMDB_API_URL },
    frontendUrl: FRONTEND_URL.replace(/\/$/, ''),
    telegram: TELEGRAM_BOT_TOKEN === undefined || TELEGRAM_CHAT_ID === undefined
      ? undefined
      : { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID, baseUrl: TELEGRAM_API_URL },
  };
}

/** Empty values (`LOG_LEVEL=` in a .env file) count as unset, so defaults apply. */
function parse<T extends z.ZodType>(schema: T, env: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')));
  if (!result.success) throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  return result.data;
}
