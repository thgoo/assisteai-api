import { describe, expect, test } from 'bun:test';
import type { RatingKey } from './ratings';
import { averageRating } from './ratings';

describe('averageRating', () => {
  test.each<[number, RatingKey]>([
    [0, 'STAY_AWAY'],
    [2.49, 'BAD'],
    [2.5, 'COOL'],
    [5.5, 'UNMISSABLE'],
    [6, 'UNMISSABLE'],
  ])('%d → %s', (score, key) => {
    expect(averageRating(score)).toBe(key);
  });

  test('rejects scores outside 0–6', () => {
    expect(() => averageRating(7)).toThrow(RangeError);
  });
});
