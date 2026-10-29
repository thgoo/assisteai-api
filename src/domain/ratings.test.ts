import { describe, expect, test } from 'bun:test';
import type { RatingLabel } from './ratings';
import { averageRatingLabel, RATING_KEYS, ratingLabel } from './ratings';

describe('ratingLabel', () => {
  test('maps every key to its pt-BR label', () => {
    expect(RATING_KEYS.map(ratingLabel)).toEqual([
      'Fique Longe', 'Muito Ruim', 'Ruinzinho', 'Legal', 'Bom', 'Muito Bom', 'Imperdível',
    ]);
  });
});

describe('averageRatingLabel', () => {
  test.each<[number, RatingLabel]>([
    [0, 'Fique Longe'],
    [2.49, 'Ruinzinho'],
    [2.5, 'Legal'],
    [5.5, 'Imperdível'],
    [6, 'Imperdível'],
  ])('%d → %s (half away from zero, like PHP round())', (score, label) => {
    expect(averageRatingLabel(score)).toBe(label);
  });

  test('rejects scores outside 0–6', () => {
    expect(() => averageRatingLabel(7)).toThrow(RangeError);
  });
});
