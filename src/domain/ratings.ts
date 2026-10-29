/** Rating keys, worst to best. A key's index is its score (0–6). The frontend owns the labels. */
export const RATING_KEYS = ['STAY_AWAY', 'VERY_BAD', 'BAD', 'COOL', 'GOOD', 'VERY_GOOD', 'UNMISSABLE'] as const;

export type RatingKey = (typeof RATING_KEYS)[number];

/** The key at the rounded mean score; halves round up (2.5 → `COOL`). */
export function averageRating(meanScore: number): RatingKey {
  const key = RATING_KEYS[Math.round(meanScore)];
  if (key === undefined) throw new RangeError(`Mean score out of range: ${meanScore}`);
  return key;
}
