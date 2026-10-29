import { Hono } from 'hono';
import { z } from 'zod';
import type { MovieService } from './movie-service';
import { cursorParam, encodeCursor } from '~/http/cursor';
import { ProblemError } from '~/http/errors';
import { validate } from '~/http/validation';
import { movieDetail, movieSummary } from './serializers';

const PAGE_SIZE = 24;

const listPosition = z.object({
  lastRatedAt: z.iso.datetime().transform(value => new Date(value)),
  id: z.number().int(),
});

export function createMovieRoutes({ movieService }: { movieService: MovieService }) {
  return new Hono()
    .get('/', validate('query', z.object({ cursor: cursorParam(listPosition).optional() })), async c => {
      const { items, next } = await movieService.listRated({ after: c.req.valid('query').cursor, limit: PAGE_SIZE });

      return c.json({
        data: items.map(movieSummary),
        nextCursor: next && encodeCursor({ lastRatedAt: next.lastRatedAt.toISOString(), id: next.id }),
      });
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
