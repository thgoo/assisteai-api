import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { EXTERNAL_ID_SOURCES, MOVIE_CATEGORIES } from '~/domain/movies';
import { foreignId, id, oneOf, timestamps } from './columns';

export const movies = pgTable('movies', {
  id: id(),
  title: text('title').notNull(),
  originalTitle: text('original_title').notNull(),
  year: text('year'),
  slug: text('slug').notNull(),
  category: text('category', { enum: MOVIE_CATEGORIES }).notNull(),
  genre: text('genre').notNull(),
  description: text('description').notNull(),
  originalDescription: text('original_description'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  ...timestamps,
}, table => [
  check('movies_category_check', oneOf(table.category, MOVIE_CATEGORIES)),
]);

/**
 * TMDb and IMDb ids of a movie. TMDb ids are only unique per category (a movie and a series can share one, Q-20),
 * so tmdb rows carry the category and imdb rows don't.
 */
export const externalIds = pgTable('external_ids', {
  id: id(),
  movieId: foreignId('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
  source: text('source', { enum: EXTERNAL_ID_SOURCES }).notNull(),
  category: text('category', { enum: MOVIE_CATEGORIES }),
  externalId: text('external_id').notNull(),
}, table => [
  unique('external_ids_source_category_external_id_unique')
    .on(table.source, table.category, table.externalId)
    .nullsNotDistinct(),
  index('external_ids_movie_id_idx').on(table.movieId),
  check('external_ids_source_check', oneOf(table.source, EXTERNAL_ID_SOURCES)),
  // `IS NOT NULL` is needed: `NULL IN (...)` is NULL, and a check only rejects FALSE.
  check('external_ids_category_check', sql`
    (${table.source} = 'tmdb' AND ${table.category} IS NOT NULL AND ${oneOf(table.category, MOVIE_CATEGORIES)})
    OR (${table.source} = 'imdb' AND ${table.category} IS NULL)
  `),
]);
