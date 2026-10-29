import { expect, test } from 'bun:test';
import { laravelDate } from './dates';

test('laravelDate: UTC with microseconds, like Laravel', () => {
  expect(laravelDate(new Date('2026-08-01T07:00:00-03:00'))).toBe('2026-08-01T10:00:00.000000Z');
});
