// The only module that reads the environment. Everything else receives what it needs from the composition root.
import { z } from 'zod';
import type { LogFormat, LogLevel } from '~/logger';
import { LOG_LEVELS } from '~/logger';

const commaSeparated = z.string().transform(value => value.split(',').map(item => item.trim()).filter(Boolean));

const envSchema = z.object({
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
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);

  const { NODE_ENV, PORT, LOG_LEVEL, CORS_ORIGINS } = result.data;
  const isProduction = NODE_ENV === 'production';
  return {
    env: NODE_ENV,
    port: PORT,
    log: {
      level: LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
      format: isProduction ? 'json' : 'pretty',
    },
    corsOrigins: CORS_ORIGINS,
  };
}
