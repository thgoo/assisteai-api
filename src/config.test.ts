import { describe, expect, test } from 'bun:test';
import { loadConfig, loadDatabaseConfig } from './config';

const CORS_ORIGINS = 'https://assisteai.com.br, https://beta2.assisteai.com.br';
const DATABASE_URL = 'postgres://assisteai:assisteai@127.0.0.1:55432/assisteai';
const JWT_SECRET = 'local-legacy-env-jwt-secret-must-be-at-least-256-bits-long-0123456789';
const REQUIRED = { CORS_ORIGINS, DATABASE_URL, JWT_SECRET };

describe('loadConfig', () => {
  test('development defaults: port 3000, pretty debug logs', () => {
    expect(loadConfig(REQUIRED)).toEqual({
      env: 'development',
      port: 3000,
      log: { level: 'debug', format: 'pretty' },
      corsOrigins: ['https://assisteai.com.br', 'https://beta2.assisteai.com.br'],
      database: { url: DATABASE_URL },
      jwtSecret: JWT_SECRET,
      googleApiUrl: 'https://www.googleapis.com',
    });
  });

  test('production logs JSON at info, unless LOG_LEVEL says otherwise', () => {
    expect(loadConfig({ ...REQUIRED, NODE_ENV: 'production' }).log).toEqual({ level: 'info', format: 'json' });
    expect(loadConfig({ ...REQUIRED, NODE_ENV: 'production', LOG_LEVEL: 'warn' }).log.level).toBe('warn');
  });

  test('empty values count as unset', () => {
    expect(loadConfig({ ...REQUIRED, LOG_LEVEL: '', PORT: '' })).toMatchObject({ port: 3000, log: { level: 'debug' } });
  });

  test('PORT is coerced to a number', () => {
    expect(loadConfig({ ...REQUIRED, PORT: '8080' }).port).toBe(8080);
  });

  test('fails listing every invalid variable', () => {
    const invalid = () => loadConfig({ ...REQUIRED, CORS_ORIGINS: 'not-a-url', LOG_LEVEL: 'loud' });
    expect(invalid).toThrow(/LOG_LEVEL/);
    expect(invalid).toThrow(/CORS_ORIGINS/);
  });

  test('CORS_ORIGINS and DATABASE_URL are required', () => {
    expect(() => loadConfig({})).toThrow(/CORS_ORIGINS/);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  test('DATABASE_URL must be a Postgres URL', () => {
    const mysql = () => loadConfig({ ...REQUIRED, DATABASE_URL: 'mysql://root@localhost/assisteai' });
    expect(mysql).toThrow(/DATABASE_URL/);
  });

  test('JWT_SECRET must be at least 256 bits, like legacy requires', () => {
    expect(() => loadConfig({ ...REQUIRED, JWT_SECRET: 'short' })).toThrow(/256 bits/);
  });

  test('loadDatabaseConfig needs only DATABASE_URL', () => {
    expect(loadDatabaseConfig({ DATABASE_URL })).toEqual({ url: DATABASE_URL });
  });
});
