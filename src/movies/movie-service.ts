import type { SQL, SQLWrapper } from 'drizzle-orm';
import { and, arrayContains, asc, count, desc, eq, exists, inArray, isNotNull, max, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '~/db/client';
import type { MovieCategory } from '~/domain/movies';
import type { RatingKey } from '~/domain/ratings';
import { movies, ratings, users } from '~/db/schema';
import { byName, textLiterals } from '~/db/sql';
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

export const MOVIE_SORTS = ['recent', 'rating', 'popular'] as const;

/** `recent`: last rated first. `rating`: best mean score first. `popular`: most ratings first. */
export type MovieSort = (typeof MOVIE_SORTS)[number];

/** All optional; they combine with AND. None of them changes a movie's rating summary. */
export interface MovieFilters {
  /** Part of the title or original title, ignoring case and accents. */
  text?: string;
  category?: MovieCategory;
  genre?: string;
  /** The average rating (the rounded key the summary shows) is one of these. */
  averages?: RatingKey[];
  ratedBy?: number;
  unratedBy?: number;
}

/** Where a page of the list starts: right after this movie, in its sort's order. */
export type ListPosition =
  | { sort: 'recent'; lastRatedAt: Date; id: number }
  /** The mean score as Postgres' exact numeric text, so ties compare equal. */
  | { sort: 'rating'; meanScore: string; count: number; id: number }
  | { sort: 'popular'; count: number; lastRatedAt: Date; id: number };

export interface MoviePage {
  items: RatedMovie[];
  /** Position of the last item when there are more, for the next page. */
  next: ListPosition | null;
}

export interface GenreCount {
  name: string;
  count: number;
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

const scoreOf = (key: RatingKey) => RATING_KEYS.indexOf(key);

const lastRatedAt = max(ratings.createdAt);
const meanScore = sql`avg(${score})`;
const ratingCount = count(ratings.id);

/** Another user's ratings, for filters that look at who rated a movie without touching its summary. */
const filterRatings = alias(ratings, 'filter_ratings');

/** `LIKE` pattern for text anywhere in a value: `%`, `_` and the escape character match literally. */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, match => `\\${match}`)}%`;
}

function matchesText(column: SQLWrapper, text: string): SQL {
  return sql`lower(unaccent(${column})) LIKE lower(unaccent(${containsPattern(text)}))`;
}

export class MovieService {
  constructor(private readonly db: Database) {}

  /** Rated movies matching the filters, in the sort's order (ties: highest id first). Keyset-paginated. */
  async listRated({ filters = {}, sort = 'recent', after, limit }: {
    filters?: MovieFilters;
    sort?: MovieSort;
    after?: ListPosition;
    limit: number;
  }): Promise<MoviePage> {
    const ratedBy = (userId: number) => exists(this.db.select({ one: sql`1` }).from(filterRatings).where(and(
      eq(filterRatings.movieId, movies.id),
      eq(filterRatings.userId, userId),
    )));
    const { text, category, genre, averages } = filters;

    const rows = await this.db
      .select({ movie: movies, summary, lastRatedAt, meanScore: sql<string>`${meanScore}::text`, ratingCount })
      .from(movies)
      .innerJoin(ratings, eq(ratings.movieId, movies.id))
      .where(and(
        text === undefined ? undefined : or(matchesText(movies.title, text), matchesText(movies.originalTitle, text)),
        category && eq(movies.category, category),
        genre === undefined ? undefined : arrayContains(movies.genres, [genre]),
        filters.ratedBy === undefined ? undefined : ratedBy(filters.ratedBy),
        filters.unratedBy === undefined ? undefined : not(ratedBy(filters.unratedBy)),
      ))
      .groupBy(movies.id)
      .having(and(
        // The average is the key at the mean score rounded half up, as `averageRating` rounds it.
        averages && sql`floor(${meanScore} + 0.5)::int IN (${sql.join(averages.map(scoreOf), sql`, `)})`,
        after && startsAfter(after),
      ))
      .orderBy(...ORDER[sort], desc(movies.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(({ movie, summary: rowSummary }) => ({ ...movie, summary: rowSummary })),
      next: rows.length > limit && last ? positionOf(sort, last) : null,
    };
  }

  /** Genres of rated movies, with how many rated movies have each, by name. */
  async listGenres(): Promise<GenreCount[]> {
    const genre = sql<string>`genre`;
    const ratedMovies = this.db
      .selectDistinct({ id: ratings.movieId })
      .from(ratings)
      .as('rated_movies');
    return this.db
      .select({ name: genre, count: count() })
      .from(movies)
      .innerJoin(ratedMovies, eq(ratedMovies.id, movies.id))
      .crossJoinLateral(sql`unnest(${movies.genres}) AS genre`)
      .groupBy(genre)
      .orderBy(...byName(genre));
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

/** The sort's key, most significant first; `id` breaks the remaining ties. */
const ORDER = {
  recent: [desc(lastRatedAt)],
  rating: [sql`${meanScore} DESC`, desc(ratingCount)],
  popular: [desc(ratingCount), desc(lastRatedAt)],
} satisfies Record<MovieSort, SQL[]>;

/** Rows after `position` in its sort's order (every key descending, so a row tuple comparison does it). */
function startsAfter(position: ListPosition): SQL {
  switch (position.sort) {
    case 'recent':
      return sql`(${lastRatedAt}, ${movies.id}) < (${position.lastRatedAt.toISOString()}::timestamptz, ${position.id})`;
    case 'rating':
      return sql`(${meanScore}, ${ratingCount}, ${movies.id})
        < (${position.meanScore}::numeric, ${position.count}, ${position.id})`;
    case 'popular':
      return sql`(${ratingCount}, ${lastRatedAt}, ${movies.id})
        < (${position.count}, ${position.lastRatedAt.toISOString()}::timestamptz, ${position.id})`;
  }
}

function positionOf(
  sort: MovieSort,
  row: { movie: Movie; lastRatedAt: Date | null; meanScore: string; ratingCount: number },
): ListPosition | null {
  const { movie: { id }, lastRatedAt: rowLastRatedAt, meanScore: rowMeanScore, ratingCount: rowCount } = row;
  // Listed movies have ratings, so they have a last rating time.
  if (rowLastRatedAt === null) return null;
  switch (sort) {
    case 'recent':
      return { sort, lastRatedAt: rowLastRatedAt, id };
    case 'rating':
      return { sort, meanScore: rowMeanScore, count: rowCount, id };
    case 'popular':
      return { sort, count: rowCount, lastRatedAt: rowLastRatedAt, id };
  }
}
