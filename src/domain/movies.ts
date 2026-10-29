export const MOVIE_CATEGORIES = ['movie', 'series'] as const;

export type MovieCategory = (typeof MOVIE_CATEGORIES)[number];

export const EXTERNAL_ID_SOURCES = ['tmdb', 'imdb'] as const;

export type ExternalIdSource = (typeof EXTERNAL_ID_SOURCES)[number];
