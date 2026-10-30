import { Hono } from 'hono';
import { z } from 'zod';
import type { ListPosition, MovieFilters, MovieService } from './movie-service';
import type { SessionService } from '~/auth/session-service';
import type { SessionCookie } from '~/http/session-cookie';
import { MOVIE_CATEGORIES } from '~/domain/movies';
import { RATING_KEYS } from '~/domain/ratings';
import { cursorParam, encodeCursor } from '~/http/cursor';
import { ProblemError } from '~/http/errors';
import { signedInUserId } from '~/http/session-cookie';
import { validate } from '~/http/validation';
import { MOVIE_SORTS } from './movie-service';
import { movieDetail, movieSummary } from './serializers';

const PAGE_SIZE = 24;

const INVALID_FILTER = { error: 'Filtro inválido.' };

const isoDate = z.iso.datetime().transform(value => new Date(value));
const id = z.number().int().positive();

/** A cursor carries its sort, so one from another sort is rejected instead of starting at a wrong place. */
const listPosition = z.discriminatedUnion('sort', [
  z.object({ sort: z.literal('recent'), lastRatedAt: isoDate, id }),
  z.object({ sort: z.literal('rating'), meanScore: z.string().regex(/^\d+(\.\d+)?$/), count: id, id }),
  z.object({ sort: z.literal('popular'), count: id, lastRatedAt: isoDate, id }),
]);

const listQuery = z.object({
  /** Blank: no text filter. */
  q: z.string(INVALID_FILTER).trim().max(100, INVALID_FILTER.error).optional()
    .transform(value => (value === '' ? undefined : value)),
  category: z.enum(MOVIE_CATEGORIES, INVALID_FILTER).optional(),
  genre: z.string(INVALID_FILTER).trim().min(1, INVALID_FILTER.error).max(100, INVALID_FILTER.error).optional(),
  minRating: z.enum(RATING_KEYS, INVALID_FILTER).optional(),
  ratedBy: z.string(INVALID_FILTER).regex(/^[1-9][0-9]{0,14}$/, INVALID_FILTER.error).transform(Number).optional(),
  unratedByMe: z.literal('true', INVALID_FILTER).optional(),
  sort: z.enum(MOVIE_SORTS, INVALID_FILTER).default('recent'),
  cursor: cursorParam(listPosition).optional(),
}).refine(query => query.cursor === undefined || query.cursor.sort === query.sort, {
  path: ['cursor'],
  message: 'Cursor inválido.',
});

export interface MovieDependencies {
  movieService: MovieService;
  sessionService: SessionService;
  sessionCookie: SessionCookie;
}

export function createMovieRoutes({ movieService, sessionService, sessionCookie }: MovieDependencies) {
  return new Hono()
    .get('/', validate('query', listQuery), async c => {
      const { q, category, genre, minRating, ratedBy, unratedByMe, sort, cursor } = c.req.valid('query');
      const filters: MovieFilters = {
        text: q,
        category,
        genre,
        minRating,
        ratedBy,
        unratedBy: unratedByMe ? await signedInUserId(c, sessionCookie, sessionService) : undefined,
      };
      const { items, next } = await movieService.listRated({ filters, sort, after: cursor, limit: PAGE_SIZE });

      return c.json({ data: items.map(movieSummary), nextCursor: next && encodeCursor(cursorKey(next)) });
    })
    .get('/random', async c => {
      const movie = await movieService.findRandomRecommended();
      if (!movie) throw new ProblemError(404, 'Nenhum filme para sugerir ainda.');

      return c.json(movieDetail(movie));
    })
    // Digits only (15 at most, so the id is a safe integer): anything else is the generic 404.
    .get('/:id{[0-9]{1,15}}', async c => {
      const movie = await movieService.findDetail(Number(c.req.param('id')));
      if (!movie) throw new ProblemError(404, 'Filme não encontrado.');

      return c.json(movieDetail(movie));
    });
}

export function createGenreRoutes({ movieService }: { movieService: MovieService }) {
  return new Hono()
    .get('/', async c => c.json({ data: await movieService.listGenres() }));
}

/** The position as JSON: dates as ISO strings. */
function cursorKey(position: ListPosition) {
  return 'lastRatedAt' in position ? { ...position, lastRatedAt: position.lastRatedAt.toISOString() } : position;
}
