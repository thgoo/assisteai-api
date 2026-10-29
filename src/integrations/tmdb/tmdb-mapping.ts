// Where TMDb's vocabulary meets ours: its `tv` is our `series`, and its images and pages live at fixed URLs.
import type { TmdbCategory } from './tmdb-client';
import type { MovieCategory } from '~/domain/movies';

const MOVIE_CATEGORY = { movie: 'movie', tv: 'series' } as const satisfies Record<TmdbCategory, MovieCategory>;
const TMDB_CATEGORY = { movie: 'movie', series: 'tv' } as const satisfies Record<MovieCategory, TmdbCategory>;

export function toMovieCategory(category: TmdbCategory): MovieCategory {
  return MOVIE_CATEGORY[category];
}

export function toTmdbCategory(category: MovieCategory): TmdbCategory {
  return TMDB_CATEGORY[category];
}

export function tmdbImageUrl(size: 'w185' | 'w500' | 'w1280', path: string | null): string | null {
  return path === null ? null : `https://image.tmdb.org/t/p/${size}${path}`;
}

/** The title's page on TMDb, a link `POST /ratings` accepts. */
export function tmdbPageUrl(category: MovieCategory, tmdbId: string): string {
  return `https://www.themoviedb.org/${toTmdbCategory(category)}/${tmdbId}`;
}
