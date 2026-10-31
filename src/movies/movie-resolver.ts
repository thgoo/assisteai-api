import { and, eq, isNull, or } from 'drizzle-orm';
import type { Database, Transaction } from '~/db/client';
import type { MovieCategory } from '~/domain/movies';
import type { TmdbClient, TmdbTitle } from '~/integrations/tmdb/tmdb-client';
import type { TitleLink } from '~/ratings/title-link';
import { externalIds, movies } from '~/db/schema';
import { slugify } from '~/domain/slug';
import { toMovieCategory, toTmdbCategory } from '~/integrations/tmdb/tmdb-mapping';

export type Movie = typeof movies.$inferSelect;

/** Finds the movie a title link points to, or fetches it from TMDb so it can be added. */
export class MovieResolver {
  constructor(private readonly db: Database, private readonly tmdb: TmdbClient) {}

  async findById(id: number): Promise<Movie | undefined> {
    const [movie] = await this.db.select().from(movies).where(eq(movies.id, id)).limit(1);
    return movie;
  }

  async find(link: TitleLink): Promise<Movie | undefined> {
    return link.source === 'imdb'
      ? this.findBy([{ source: 'imdb', externalId: link.imdbId }])
      : this.findBy([{ source: 'tmdb', category: link.category, externalId: link.tmdbId }]);
  }

  /** A movie already stored under either of the title's ids (e.g. added from its IMDb link, now linked by TMDb). */
  async findByTitle(title: TmdbTitle): Promise<Movie | undefined> {
    return this.findBy([
      { source: 'tmdb', category: toMovieCategory(title.category), externalId: title.tmdbId },
      ...(title.imdbId === null ? [] : [{ source: 'imdb' as const, externalId: title.imdbId }]),
    ]);
  }

  /** The title behind a link, from TMDb, or `undefined` when TMDb doesn't know it. */
  async fetchTitle(link: TitleLink): Promise<TmdbTitle | undefined> {
    const reference = link.source === 'imdb'
      ? await this.tmdb.findByImdbId(link.imdbId)
      : { category: toTmdbCategory(link.category), tmdbId: link.tmdbId };
    return reference && this.tmdb.fetchTitle(reference);
  }

  /** Adds a title with both its ids. A concurrent add of the same title fails on the external ids' unique key. */
  async insert(tx: Transaction, title: TmdbTitle): Promise<Movie> {
    const category = toMovieCategory(title.category);
    const [movie] = await tx.insert(movies).values({
      title: title.title,
      originalTitle: title.originalTitle,
      year: title.year,
      slug: slugify(title.originalTitle) || slugify(title.title) || `${category}-${title.tmdbId}`,
      category,
      genres: title.genres,
      description: title.description,
      originalDescription: title.originalDescription,
      posterPath: title.posterPath,
      backdropPath: title.backdropPath,
    }).returning();
    if (!movie) throw new Error('Insert returned no movie');

    await tx.insert(externalIds).values([
      { movieId: movie.id, source: 'tmdb', category, externalId: title.tmdbId },
      ...(title.imdbId === null ? [] : [{ movieId: movie.id, source: 'imdb' as const, externalId: title.imdbId }]),
    ]);
    return movie;
  }

  private async findBy(
    keys: { source: 'imdb' | 'tmdb'; category?: MovieCategory; externalId: string }[],
  ): Promise<Movie | undefined> {
    const [row] = await this.db
      .select({ movie: movies })
      .from(externalIds)
      .innerJoin(movies, eq(movies.id, externalIds.movieId))
      .where(or(...keys.map(key => and(
        eq(externalIds.source, key.source),
        key.category === undefined ? isNull(externalIds.category) : eq(externalIds.category, key.category),
        eq(externalIds.externalId, key.externalId),
      ))))
      .limit(1);
    return row?.movie;
  }
}
