import { and, asc, count, countDistinct, desc, eq, exists, inArray, isNotNull, max, sql } from 'drizzle-orm';
import type { Database } from '~/db/client';
import type { RatingKey } from '~/domain/ratings';
import { movies, threads, users } from '~/db/schema';
import { textLiterals } from '~/db/sql';
import { RATING_KEYS } from '~/domain/ratings';

export type Movie = typeof movies.$inferSelect;

export type Thread = typeof threads.$inferSelect;

export interface RatingSummary {
  count: number;
  /** Mean of the scores (key indexes, 0–6), not rounded. Null without ratings. */
  averageScore: number | null;
  lastRating: RatingKey | null;
}

export type RatedMovie = Movie & { rating: RatingSummary };

export type ThreadWithUser = Thread & { user: { name: string; avatar: string | null } };

export type MovieDetail = RatedMovie & { threads: ThreadWithUser[] };

export interface Page<T> {
  items: T[];
  total: number;
}

/** Ratings that make a movie worth suggesting on the home page. */
const RECOMMENDED_RATINGS: RatingKey[] = ['UNMISSABLE', 'VERY_GOOD', 'GOOD', 'COOL'];

/** A thread's score is the index of its key in RATING_KEYS. */
const score = sql`array_position(ARRAY[${textLiterals(RATING_KEYS)}], ${threads.rating}) - 1`;

/** Aggregates over the joined threads. Safe on a left join: a movie without threads gets 0 / null / null. */
const ratingSummary = {
  count: count(threads.id),
  averageScore: sql<number | null>`avg(${score})`.mapWith(Number),
  lastRating: sql<RatingKey | null>`
    (array_agg(${threads.rating} ORDER BY ${threads.createdAt} DESC, ${threads.id} DESC))[1]
  `,
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

  /** A movie with its ratings in id order, each with its author. */
  async findDetail(id: number): Promise<MovieDetail | undefined> {
    const [[row], threadRows] = await Promise.all([
      this.db
        .select({ movie: movies, rating: ratingSummary })
        .from(movies)
        .leftJoin(threads, eq(threads.movieId, movies.id))
        .where(eq(movies.id, id))
        .groupBy(movies.id),
      this.db
        .select({ thread: threads, user: { name: users.name, avatar: users.avatar } })
        .from(threads)
        .innerJoin(users, eq(users.id, threads.userId))
        .where(eq(threads.movieId, id))
        .orderBy(asc(threads.id)),
    ]);
    if (!row) return undefined;

    return { ...row.movie, rating: row.rating, threads: threadRows.map(({ thread, user }) => ({ ...thread, user })) };
  }

  /** A random movie with a backdrop and at least one COOL-or-better rating. */
  async findRandomRecommended(): Promise<MovieDetail | undefined> {
    const [row] = await this.db
      .select({ id: movies.id })
      .from(movies)
      .where(and(
        isNotNull(movies.backdropPath),
        exists(this.db.select({ one: sql`1` }).from(threads).where(and(
          eq(threads.movieId, movies.id),
          inArray(threads.rating, RECOMMENDED_RATINGS),
        ))),
      ))
      .orderBy(sql`random()`)
      .limit(1);

    return row && this.findDetail(row.id);
  }
}
