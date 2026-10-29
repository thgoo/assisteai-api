/** The rating keys stored in `threads.rating`, worst to best. */
export const RATING_KEYS = ['STAY_AWAY', 'VERY_BAD', 'BAD', 'COOL', 'GOOD', 'VERY_GOOD', 'UNMISSABLE'] as const;

export type RatingKey = (typeof RATING_KEYS)[number];
