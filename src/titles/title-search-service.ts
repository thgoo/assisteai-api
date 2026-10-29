import { and, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '~/db/client';
import type { MovieCategory } from '~/domain/movies';
import type { TmdbClient, TmdbSearchResult } from '~/integrations/tmdb/tmdb-client';
import type { Logger } from '~/logger';
import { externalIds, ratings } from '~/db/schema';
import { MOVIE_CATEGORIES } from '~/domain/movies';
import { ProblemError } from '~/http/errors';
import { toMovieCategory } from '~/integrations/tmdb/tmdb-mapping';

export interface TitleSearchResult extends Omit<TmdbSearchResult, 'category'> {
  category: MovieCategory;
  /** The user already rated this title. */
  ratedByMe: boolean;
}

/** Results per search: enough for an autocomplete list. */
const MAX_RESULTS = 10;

/** Searches TMDb for titles to rate, marking the ones the user already rated. */
export class TitleSearchService {
  constructor(private readonly db: Database, private readonly tmdb: TmdbClient, private readonly logger: Logger) {}

  async search(userId: number, query: string): Promise<TitleSearchResult[]> {
    let found: TmdbSearchResult[];
    try {
      found = await this.tmdb.search(query);
    } catch (error) {
      this.logger.error('TMDb search failed', { error });
      throw new ProblemError(502, 'Não foi possível buscar agora. Tente de novo.');
    }

    const results = found.slice(0, MAX_RESULTS)
      .map(result => ({ ...result, category: toMovieCategory(result.category) }));
    const rated = await this.ratedTitles(userId, results);
    return results.map(result => ({ ...result, ratedByMe: rated.has(titleKey(result.category, result.tmdbId)) }));
  }

  /** The results the user rated (as `titleKey`s), looked up by TMDb id in one query. */
  private async ratedTitles(
    userId: number,
    results: { category: MovieCategory; tmdbId: string }[],
  ): Promise<Set<string>> {
    const byCategory = MOVIE_CATEGORIES.flatMap(category => {
      const ids = results.filter(result => result.category === category).map(result => result.tmdbId);
      return ids.length === 0 ? [] : [and(eq(externalIds.category, category), inArray(externalIds.externalId, ids))];
    });
    if (byCategory.length === 0) return new Set();

    const rows = await this.db
      .select({ category: externalIds.category, tmdbId: externalIds.externalId })
      .from(externalIds)
      .innerJoin(ratings, and(eq(ratings.movieId, externalIds.movieId), eq(ratings.userId, userId)))
      .where(and(eq(externalIds.source, 'tmdb'), or(...byCategory)));
    return new Set(rows.flatMap(row => (row.category === null ? [] : [titleKey(row.category, row.tmdbId)])));
  }
}

function titleKey(category: MovieCategory, tmdbId: string): string {
  return `${category}:${tmdbId}`;
}
