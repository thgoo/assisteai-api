// Response shapes the frontend relies on (doc 01 §8), plus the cheap legacy fields doc 02 keeps.
// Objects aren't strict: extra legacy fields pass, and fields the new app must drop are asserted in the tests.
import { z } from 'zod';
import { RATING_LABELS } from './oracle';

const ratingLabel = z.enum(RATING_LABELS);

export const movieListItemSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  category: z.enum(['MOVIE', 'SERIE']),
  title: z.string(),
  original_title: z.string(),
  year: z.string().nullable(),
  genre: z.string(),
  description: z.string(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable(),
  average_rating: ratingLabel,
  last_rating: ratingLabel,
  rating_count: z.number().int(),
});

export const movieListSchema = z.object({
  current_page: z.number().int(),
  data: z.array(movieListItemSchema),
  next_page_url: z.string().nullable(),
  prev_page_url: z.string().nullable(),
  last_page: z.number().int(),
  per_page: z.number().int(),
  total: z.number().int(),
  from: z.number().int().nullable(),
  to: z.number().int().nullable(),
});

const threadSchema = z.object({
  id: z.number().int(),
  rating: ratingLabel,
});

const threadWithUserSchema = threadSchema.extend({
  user: z.looseObject({
    name: z.string(),
    avatar: z.string().nullable(),
  }),
});

function movieDetailSchema<T extends z.ZodType>(thread: T) {
  return z.object({
    backdrop_path: z.string().nullable(),
    poster_path: z.string().nullable(),
    original_title: z.string(),
    title: z.string(),
    description: z.string(),
    genre: z.string(),
    year: z.string().nullable(),
    rating: z.object({
      count: z.number().int(),
      average: ratingLabel.nullable(),
      last: ratingLabel.nullable(),
      list: z.array(thread),
    }),
  });
}

export const movieDetailsResponseSchema = z.object({
  success: z.literal(true),
  data: movieDetailSchema(threadWithUserSchema),
});

// /movies/random loads the threads without their user.
export const randomMovieResponseSchema = z.object({
  success: z.literal(true),
  data: movieDetailSchema(threadSchema),
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

/** <User> as returned to its owner (login, /auth/me): doc 02 Phase 3. */
export const userSchema = z.object({
  name: z.string(),
  email: z.string(),
  avatar: z.string().nullable(),
  // Absent (not null) in the legacy response to a brand-new user's first login; see auth-login.test.ts.
  theme: z.string().nullable().optional(),
  // Not cast by the legacy model: a plain `Y-m-d H:i:s` string in America/Sao_Paulo local time (doc 01 §6).
  last_login_at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  created_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000000Z$/),
});

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('bearer'),
  expires_in: z.literal(7200),
});

export const loginResponseSchema = tokenResponseSchema.extend({ user: userSchema });

export const meResponseSchema = z.object({ success: z.literal(true), user: userSchema });

/** Body of the legacy error handler and auth middleware: {success, status, message}. */
export const statusErrorSchema = errorResponseSchema.extend({ status: z.number().int() });
