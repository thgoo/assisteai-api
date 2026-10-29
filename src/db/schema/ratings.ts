import { check, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { RATING_KEYS } from '~/domain/ratings';
import { foreignId, id, oneOf, timestamps } from './columns';
import { movies } from './movies';
import { users } from './users';

/** A user's rating of a movie: one per user and movie. */
export const ratings = pgTable('ratings', {
  id: id(),
  userId: foreignId('user_id').references(() => users.id),
  movieId: foreignId('movie_id').references(() => movies.id),
  rating: text('rating', { enum: RATING_KEYS }).notNull(),
  comment: text('comment'),
  ...timestamps,
}, table => [
  unique('ratings_user_id_movie_id_unique').on(table.userId, table.movieId),
  index('ratings_movie_id_created_at_idx').on(table.movieId, table.createdAt.desc()),
  index('ratings_user_id_idx').on(table.userId),
  check('ratings_rating_check', oneOf(table.rating, RATING_KEYS)),
]);
