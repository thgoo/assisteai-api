import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Mock } from 'bun:test';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { ConsoleLogger } from './console-logger';

describe('ConsoleLogger', () => {
  let log: Mock<typeof console.log>;
  let error: Mock<typeof console.error>;

  beforeEach(() => {
    log = spyOn(console, 'log').mockImplementation(() => undefined);
    error = spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
  });

  function lastLine(spy: Mock<typeof console.log>): string {
    return String(spy.mock.lastCall?.[0]);
  }

  function lastJson(spy: Mock<typeof console.log>): Record<string, unknown> {
    return JSON.parse(lastLine(spy)) as Record<string, unknown>;
  }

  test('json: one object per line with level, message, timestamp and context', () => {
    new ConsoleLogger({ level: 'info', format: 'json' }).info('Listening', { port: 3000 });

    expect(lastJson(log)).toMatchObject({ level: 'info', message: 'Listening', port: 3000 });
    expect(lastJson(log)['timestamp']).toBeString();
  });

  test('skips entries below the configured level', () => {
    const logger = new ConsoleLogger({ level: 'warn', format: 'json' });
    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('shown');

    expect(log).toHaveBeenCalledTimes(1);
  });

  test('errors go to stderr, with Error objects serialized', () => {
    new ConsoleLogger({ level: 'debug', format: 'json' }).error('Boom', { error: new TypeError('bad') });

    expect(log).not.toHaveBeenCalled();
    expect(lastJson(error)['error']).toMatchObject({ name: 'TypeError', message: 'bad' });
  });

  test('errors keep their own properties and causes, without bound query values', () => {
    const postgres = Object.assign(new Error('terminating connection'), { code: '57P01', severity: 'FATAL' });
    const query = new DrizzleQueryError('select 1 where id = $1', ['someone@example.com'], postgres);
    new ConsoleLogger({ level: 'debug', format: 'json' }).error('Boom', { error: query });

    const logged = lastJson(error)['error'];
    expect(logged).toMatchObject({
      message: 'Failed query: select 1 where id = $1',
      query: 'select 1 where id = $1',
      cause: { message: 'terminating connection', code: '57P01', severity: 'FATAL' },
    });
    expect(JSON.stringify(logged)).not.toContain('someone@example.com');
  });

  test('cause chains stop at a fixed depth, so cycles terminate', () => {
    const first = new Error('first');
    first.cause = new Error('second', { cause: first });
    new ConsoleLogger({ level: 'debug', format: 'json' }).error('Boom', { error: first });

    expect(lastJson(error)['error']).toMatchObject({ cause: { cause: { cause: { message: 'second' } } } });
  });

  test('child loggers add their context to every entry, and calls can override it', () => {
    const logger = new ConsoleLogger({ level: 'debug', format: 'json', context: { app: 'api' } });
    logger.child({ requestId: 'r1' }).info('request', { status: 200 });

    expect(lastJson(log)).toMatchObject({ app: 'api', requestId: 'r1', status: 200 });
  });

  test('pretty: a single line with the level and key=value context', () => {
    new ConsoleLogger({ level: 'debug', format: 'pretty' }).warn('Slow', { durationMs: 900 });

    expect(Bun.stripANSI(lastLine(log))).toMatch(/^\d{2}:\d{2}:\d{2} \[WARN\] Slow durationMs=900$/);
  });
});
