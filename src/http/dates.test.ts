import { expect, test } from 'bun:test';
import { laravelDate, saoPauloLocalDate } from './dates';

test('laravelDate: UTC with microseconds, like Laravel', () => {
  expect(laravelDate(new Date('2026-08-01T07:00:00-03:00'))).toBe('2026-08-01T10:00:00.000000Z');
});

test('saoPauloLocalDate: local time without zone, like legacy last_login_at', () => {
  expect(saoPauloLocalDate(new Date('2026-10-28T18:36:47Z'))).toBe('2026-10-28 15:36:47');
  expect(saoPauloLocalDate(new Date('2026-01-01T02:05:09Z'))).toBe('2025-12-31 23:05:09');
});
