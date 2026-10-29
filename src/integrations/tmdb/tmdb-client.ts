import { z } from 'zod';

export type TmdbCategory = 'movie' | 'tv';

export interface TmdbReference {
  category: TmdbCategory;
  tmdbId: string;
}

/** A movie or TV show, with pt-BR text where TMDb has it and en-US genres and images. */
export interface TmdbTitle extends TmdbReference {
  imdbId: string | null;
  title: string;
  originalTitle: string;
  /** Year of the release (movies) or first air (TV) date. */
  year: number | null;
  genres: string[];
  description: string;
  /** The en-US overview. */
  originalDescription: string | null;
  posterPath: string | null;
  backdropPath: string | null;
}

/** A movie or TV show as TMDb's search lists it, with pt-BR text where TMDb has it. */
export interface TmdbSearchResult extends TmdbReference {
  title: string;
  originalTitle: string;
  year: number | null;
  posterPath: string | null;
}

export interface TmdbClientOptions {
  /** `https://api.themoviedb.org`, or the mock in tests. */
  baseUrl: string;
  /** API read access token (v4 auth), sent as a Bearer header. */
  accessToken: string;
  timeoutMs: number;
  /** Injectable for tests. */
  fetch?: (request: Request) => Promise<Response>;
}

/** TMDb sends missing values as `null`, `""` or not at all. */
const nonEmpty = z.string().nullish().transform(value => (value === undefined || value === '' ? null : value));

const titleSchema = z.object({
  id: z.number().int(),
  title: nonEmpty,
  name: nonEmpty,
  original_title: nonEmpty,
  original_name: nonEmpty,
  release_date: nonEmpty,
  first_air_date: nonEmpty,
  overview: nonEmpty,
  genres: z.array(z.object({ name: z.string() })).default([]),
  poster_path: nonEmpty,
  backdrop_path: nonEmpty,
  external_ids: z.object({ imdb_id: nonEmpty }).default({ imdb_id: null }),
});

type TitleResponse = z.infer<typeof titleSchema>;

const searchSchema = z.object({
  results: z.array(z.object({
    media_type: z.string(),
    id: z.number().int(),
    title: nonEmpty,
    name: nonEmpty,
    original_title: nonEmpty,
    original_name: nonEmpty,
    release_date: nonEmpty,
    first_air_date: nonEmpty,
    poster_path: nonEmpty,
  })),
});

const findSchema = z.object({
  movie_results: z.array(z.object({ id: z.number().int() })),
  tv_results: z.array(z.object({ id: z.number().int() })),
});

export class TmdbClient {
  private readonly fetch: (request: Request) => Promise<Response>;

  constructor(private readonly options: TmdbClientOptions) {
    this.fetch = options.fetch ?? (request => fetch(request));
  }

  /** The TMDb movie (preferred) or TV show for an IMDb id, or `undefined` when TMDb doesn't know it. */
  async findByImdbId(imdbId: string): Promise<TmdbReference | undefined> {
    const body = await this.get(`/3/find/${imdbId}`, { external_source: 'imdb_id' });
    if (body === undefined) return undefined;

    const { movie_results: [movie], tv_results: [tv] } = findSchema.parse(body);
    if (movie) return { category: 'movie', tmdbId: String(movie.id) };
    if (tv) return { category: 'tv', tmdbId: String(tv.id) };
    return undefined;
  }

  /** Movies and TV shows matching the text, in TMDb's relevance order (its first page; people are left out). */
  async search(query: string): Promise<TmdbSearchResult[]> {
    const body = await this.get('/3/search/multi', { query, language: 'pt-BR', include_adult: 'false', page: '1' });
    if (body === undefined) throw new Error('TMDb /3/search/multi answered 404');
    return searchSchema.parse(body).results.flatMap(result => {
      if (result.media_type !== 'movie' && result.media_type !== 'tv') return [];
      const originalTitle = result.original_title ?? result.original_name;
      const title = result.title ?? result.name ?? originalTitle;
      if (title === null || originalTitle === null) return [];

      return [{
        category: result.media_type,
        tmdbId: String(result.id),
        title,
        originalTitle,
        year: yearOf(result.release_date ?? result.first_air_date),
        posterPath: result.poster_path,
      }];
    });
  }

  /** Both languages in parallel, merged. `undefined` when the title doesn't exist. */
  async fetchTitle({ category, tmdbId }: TmdbReference): Promise<TmdbTitle | undefined> {
    const path = `/3/${category}/${tmdbId}`;
    const [pt, en] = await Promise.all(['pt-BR', 'en-US'].map(async language => {
      const body = await this.get(path, { language, append_to_response: 'external_ids' });
      return body === undefined ? undefined : titleSchema.parse(body);
    }));
    if (!pt || !en) return undefined;

    return mergeTitle({ category, tmdbId }, pt, en);
  }

  /** The parsed JSON body, `undefined` on 404. Other failures (network, timeout, 5xx, bad token) throw. */
  private async get(path: string, query: Record<string, string>): Promise<unknown> {
    // Concatenated, not `new URL(path, base)`, which would drop a path prefix in the base URL.
    const url = new URL(`${this.options.baseUrl.replace(/\/$/, '')}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    const response = await this.fetch(new Request(url.href, {
      headers: { Authorization: `Bearer ${this.options.accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(this.options.timeoutMs),
    }));
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`TMDb ${path} failed with ${response.status}`);
    return response.json();
  }
}

/** Text from pt-BR when present, falling back to en-US; genres and images always from en-US. */
export function mergeTitle(reference: TmdbReference, pt: TitleResponse, en: TitleResponse): TmdbTitle {
  const originalTitle = en.original_title ?? en.original_name ?? pt.original_title ?? pt.original_name;
  const title = pt.title ?? pt.name ?? en.title ?? en.name ?? originalTitle;
  if (title === null || originalTitle === null) {
    throw new Error(`TMDb ${reference.category} ${reference.tmdbId} has no title`);
  }

  return {
    ...reference,
    imdbId: en.external_ids.imdb_id ?? pt.external_ids.imdb_id,
    title,
    originalTitle,
    year: yearOf(en.release_date ?? en.first_air_date),
    genres: en.genres.map(genre => genre.name),
    description: pt.overview ?? en.overview ?? '',
    originalDescription: en.overview,
    posterPath: en.poster_path,
    backdropPath: en.backdrop_path,
  };
}

/** The year of a TMDb date (`YYYY-MM-DD`). */
function yearOf(date: string | null): number | null {
  return date === null ? null : Number(date.slice(0, 4));
}
