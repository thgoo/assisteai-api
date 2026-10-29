import type { MovieCategory } from '~/domain/movies';

export type TitleLink =
  | { source: 'imdb'; imdbId: string }
  | { source: 'tmdb'; category: MovieCategory; tmdbId: string };

const IMDB_HOSTS = new Set(['imdb.com', 'www.imdb.com', 'm.imdb.com']);
const TMDB_HOSTS = new Set(['themoviedb.org', 'www.themoviedb.org']);

/**
 * The title an IMDb (`/title/tt0133093/`, optionally after a language prefix like `/pt/`) or TMDb (`/movie/603-matrix`,
 * `/tv/1399`) link points to, or `undefined` for anything else.
 */
export function parseTitleLink(value: string): TitleLink | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;

  if (IMDB_HOSTS.has(url.hostname)) {
    const imdbId = /^\/(?:[a-z]{2}\/)?title\/(tt\d{7,10})(?:\/|$)/.exec(url.pathname)?.[1];
    return imdbId === undefined ? undefined : { source: 'imdb', imdbId };
  }
  if (TMDB_HOSTS.has(url.hostname)) {
    const match = /^\/(movie|tv)\/(\d{1,10})(?:-[^/]*)?(?:\/|$)/.exec(url.pathname);
    if (!match?.[1] || !match[2]) return undefined;
    return { source: 'tmdb', category: match[1] === 'tv' ? 'series' : 'movie', tmdbId: match[2] };
  }
  return undefined;
}
