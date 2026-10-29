import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Mock } from 'bun:test';
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
