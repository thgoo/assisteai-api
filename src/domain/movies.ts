/** `SERIE` (sic) is what the legacy API and the frontend use. */
export const MOVIE_CATEGORIES = ['MOVIE', 'SERIE'] as const;

export type MovieCategory = (typeof MOVIE_CATEGORIES)[number];

export const EXTERNAL_ID_SOURCES = ['tmdb', 'imdb'] as const;

export type ExternalIdSource = (typeof EXTERNAL_ID_SOURCES)[number];
