import { count, countDistinct, desc, eq, max, sql } from 'drizzle-orm';
import type { Database } from '~/db/client';
import type { RatingKey } from '~/domain/ratings';
import { movies, threads } from '~/db/schema';
import { textLiterals } from '~/db/sql';
import { RATING_KEYS } from '~/domain/ratings';

export type Movie = typeof movies.$inferSelect;

export interface RatingSummary {
  count: number;
  /** Mean of the scores (key indexes, 0–6), not rounded. */
  averageScore: number;
  lastRating: RatingKey;
}

export type RatedMovie = Movie & { rating: RatingSummary };

export interface Page<T> {
  items: T[];
  total: number;
}

/** A thread's score is the index of its key in RATING_KEYS. */
const score = sql`array_position(ARRAY[${textLiterals(RATING_KEYS)}], ${threads.rating}) - 1`;

const ratingSummary = {
  count: count(),
  averageScore: sql`avg(${score})`.mapWith(Number),
  lastRating: sql<RatingKey>`(array_agg(${threads.rating} ORDER BY ${threads.createdAt} DESC, ${threads.id} DESC))[1]`,
};

export class MovieService {
  constructor(private readonly db: Database) {}

  /** Movies with at least one rating, most recently rated first (ties: newest movie first, Q-25). */
  async listRated({ limit, offset }: { limit: number; offset: number }): Promise<Page<RatedMovie>> {
    const [rows, [totals]] = await Promise.all([
      this.db
        .select({ movie: movies, rating: ratingSummary })
        .from(movies)
        .innerJoin(threads, eq(threads.movieId, movies.id))
        .groupBy(movies.id)
        .orderBy(desc(max(threads.createdAt)), desc(movies.id))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: countDistinct(threads.movieId) }).from(threads),
    ]);

    return {
      items: rows.map(({ movie, rating }) => ({ ...movie, rating })),
      total: totals?.total ?? 0,
    };
  }
}
