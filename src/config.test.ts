import { describe, expect, test } from 'bun:test';
import { loadConfig } from './config';

const CORS_ORIGINS = 'https://assisteai.com.br, https://beta2.assisteai.com.br';

describe('loadConfig', () => {
  test('development defaults: port 3000, pretty debug logs', () => {
    expect(loadConfig({ CORS_ORIGINS })).toEqual({
      env: 'development',
      port: 3000,
      log: { level: 'debug', format: 'pretty' },
      corsOrigins: ['https://assisteai.com.br', 'https://beta2.assisteai.com.br'],
    });
  });

  test('production logs JSON at info, unless LOG_LEVEL says otherwise', () => {
    expect(loadConfig({ CORS_ORIGINS, NODE_ENV: 'production' }).log).toEqual({ level: 'info', format: 'json' });
    expect(loadConfig({ CORS_ORIGINS, NODE_ENV: 'production', LOG_LEVEL: 'warn' }).log.level).toBe('warn');
  });

  test('PORT is coerced to a number', () => {
    expect(loadConfig({ CORS_ORIGINS, PORT: '8080' }).port).toBe(8080);
  });

  test('fails listing every invalid variable', () => {
    const invalid = () => loadConfig({ CORS_ORIGINS: 'not-a-url', LOG_LEVEL: 'loud' });
    expect(invalid).toThrow(/LOG_LEVEL/);
    expect(invalid).toThrow(/CORS_ORIGINS/);
  });

  test('CORS_ORIGINS is required', () => {
    expect(() => loadConfig({})).toThrow(/CORS_ORIGINS/);
  });
});
