/** The rating keys stored in `threads.rating`, worst to best. A key's index is its score (0–6). */
export const RATING_KEYS = ['STAY_AWAY', 'VERY_BAD', 'BAD', 'COOL', 'GOOD', 'VERY_GOOD', 'UNMISSABLE'] as const;

export type RatingKey = (typeof RATING_KEYS)[number];

/** What the API sends instead of the key (the frontend shows these as is). */
export const RATING_LABELS = {
  STAY_AWAY: 'Fique Longe',
  VERY_BAD: 'Muito Ruim',
  BAD: 'Ruinzinho',
  COOL: 'Legal',
  GOOD: 'Bom',
  VERY_GOOD: 'Muito Bom',
  UNMISSABLE: 'Imperdível',
} as const satisfies Record<RatingKey, string>;

export type RatingLabel = (typeof RATING_LABELS)[RatingKey];

export function ratingLabel(key: RatingKey): RatingLabel {
  return RATING_LABELS[key];
}

/**
 * The label of a rounded average score: 2.5 → 3 → `Legal`. Legacy rounds with PHP's `round()` (half away from zero),
 * which matches `Math.round` because scores are never negative.
 */
export function averageRatingLabel(averageScore: number): RatingLabel {
  const key = RATING_KEYS[Math.round(averageScore)];
  if (key === undefined) throw new RangeError(`Average score out of range: ${averageScore}`);
  return RATING_LABELS[key];
}
