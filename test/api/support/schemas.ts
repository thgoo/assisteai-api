// Shapes from doc 05. Objects are strict: an extra field is a contract change and must show up in a test.
import { z } from 'zod';
import { RATING_KEYS } from '../../fixtures/dataset';

const ratingKey = z.enum(RATING_KEYS);

export const problemSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional(),
});

const ratingSummarySchema = z.strictObject({
  count: z.number().int(),
  average: ratingKey.nullable(),
  last: ratingKey.nullable(),
});

export const movieSummarySchema = z.strictObject({
  id: z.number().int(),
  slug: z.string(),
  category: z.enum(['movie', 'series']),
  title: z.string(),
  originalTitle: z.string(),
  year: z.number().int().nullable(),
  posterUrl: z.url().nullable(),
  rating: ratingSummarySchema,
});

export const movieDetailSchema = movieSummarySchema.extend({
  genres: z.array(z.string()),
  description: z.string(),
  backdropUrl: z.url().nullable(),
  ratings: z.array(z.strictObject({
    id: z.number().int(),
    rating: ratingKey,
    comment: z.string().nullable(),
    createdAt: z.iso.datetime(),
    user: z.strictObject({ name: z.string(), avatarUrl: z.url().nullable() }),
  })),
});

export const movieListSchema = z.strictObject({
  data: z.array(movieSummarySchema),
  nextCursor: z.string().nullable(),
});

export const userResponseSchema = z.strictObject({
  user: z.strictObject({ name: z.string(), email: z.email(), avatarUrl: z.url().nullable() }),
});
