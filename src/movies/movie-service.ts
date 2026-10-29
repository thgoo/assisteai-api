import { and, asc, count, desc, eq, exists, inArray, isNotNull, max, sql } from 'drizzle-orm';
import type { Database } from '~/db/client';
import type { RatingKey } from '~/domain/ratings';
import { movies, ratings, users } from '~/db/schema';
import { textLiterals } from '~/db/sql';
import { RATING_KEYS } from '~/domain/ratings';

export type Movie = typeof movies.$inferSelect;

export interface RatingSummary {
  count: number;
  /** Mean of the scores (key indexes, 0–6), not rounded. Null without ratings. */
  meanScore: number | null;
  last: RatingKey | null;
}

export type RatedMovie = Movie & { summary: RatingSummary };

export interface MovieRating {
  id: number;
  rating: RatingKey;
  comment: string | null;
  createdAt: Date;
  user: { name: string; avatarUrl: string | null };
}

export type MovieDetail = RatedMovie & { ratings: MovieRating[] };

/** Where a page of the list starts: right after this movie in "most recently rated" order. */
export interface ListPosition {
  lastRatedAt: Date;
  id: number;
}

export interface MoviePage {
  items: RatedMovie[];
  /** Position of the last item when there are more, for the next page. */
  next: ListPosition | null;
}

/** Ratings that make a movie worth suggesting on the home page. */
const RECOMMENDED_RATINGS: RatingKey[] = ['UNMISSABLE', 'VERY_GOOD', 'GOOD', 'COOL'];

/** A rating's score is the index of its key in RATING_KEYS. */
const score = sql`array_position(ARRAY[${textLiterals(RATING_KEYS)}], ${ratings.rating}) - 1`;

/** Aggregates over the joined ratings. Safe on a left join: a movie without ratings gets 0 / null / null. */
const summary = {
  count: count(ratings.id),
  meanScore: sql<number | null>`avg(${score})`.mapWith(Number),
  last: sql<RatingKey | null>`
    (array_agg(${ratings.rating} ORDER BY ${ratings.createdAt} DESC, ${ratings.id} DESC))[1]
  `,
};

const lastRatedAt = max(ratings.createdAt);

export class MovieService {
  constructor(private readonly db: Database) {}

  /** Movies with at least one rating, most recently rated first (ties: highest id first). Keyset-paginated. */
  async listRated({ after, limit }: { after?: ListPosition; limit: number }): Promise<MoviePage> {
    const rows = await this.db
      .select({ movie: movies, summary, lastRatedAt })
      .from(movies)
      .innerJoin(ratings, eq(ratings.movieId, movies.id))
      .groupBy(movies.id)
      .having(after && sql`
        (${lastRatedAt}, ${movies.id}) < (${after.lastRatedAt.toISOString()}::timestamptz, ${after.id})
      `)
      .orderBy(desc(lastRatedAt), desc(movies.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(({ movie, summary: rowSummary }) => ({ ...movie, summary: rowSummary })),
      next: rows.length > limit && last?.lastRatedAt ? { lastRatedAt: last.lastRatedAt, id: last.movie.id } : null,
    };
  }

  /** A movie with its ratings, oldest first, each with its author's public profile. */
  async findDetail(id: number): Promise<MovieDetail | undefined> {
    const [[row], ratingRows] = await Promise.all([
      this.db
        .select({ movie: movies, summary })
        .from(movies)
        .leftJoin(ratings, eq(ratings.movieId, movies.id))
        .where(eq(movies.id, id))
        .groupBy(movies.id),
      this.db
        .select({
          id: ratings.id,
          rating: ratings.rating,
          comment: ratings.comment,
          createdAt: ratings.createdAt,
          user: { name: users.name, avatarUrl: users.avatarUrl },
        })
        .from(ratings)
        .innerJoin(users, eq(users.id, ratings.userId))
        .where(eq(ratings.movieId, id))
        .orderBy(asc(ratings.createdAt), asc(ratings.id)),
    ]);
    if (!row) return undefined;

    return { ...row.movie, summary: row.summary, ratings: ratingRows };
  }

  /** A random movie with a backdrop and at least one COOL-or-better rating. */
  async findRandomRecommended(): Promise<MovieDetail | undefined> {
    const [row] = await this.db
      .select({ id: movies.id })
      .from(movies)
      .where(and(
        isNotNull(movies.backdropPath),
        exists(this.db.select({ one: sql`1` }).from(ratings).where(and(
          eq(ratings.movieId, movies.id),
          inArray(ratings.rating, RECOMMENDED_RATINGS),
        ))),
      ))
      .orderBy(sql`random()`)
      .limit(1);

    return row && this.findDetail(row.id);
  }
}
