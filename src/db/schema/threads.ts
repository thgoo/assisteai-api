import { check, index, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { RATING_KEYS } from '~/domain/ratings';
import { foreignId, id, oneOf, timestamps } from './columns';
import { movies } from './movies';
import { users } from './users';

/** A user's rating of a movie (legacy name: one thread per movie per user). */
export const threads = pgTable('threads', {
  id: id(),
  userId: foreignId('user_id').references(() => users.id),
  movieId: foreignId('movie_id').references(() => movies.id),
  rating: text('rating', { enum: RATING_KEYS }).notNull(),
  comment: text('comment'),
  ...timestamps,
}, table => [
  unique('threads_user_id_movie_id_unique').on(table.userId, table.movieId),
  index('threads_movie_id_created_at_idx').on(table.movieId, table.createdAt.desc()),
  index('threads_user_id_idx').on(table.userId),
  check('threads_rating_check', oneOf(table.rating, RATING_KEYS)),
]);
