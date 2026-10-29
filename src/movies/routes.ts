import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { MovieService } from './movie-service';
import { ApiError } from '~/http/errors';
import { lengthAwarePage, offsetOf, pageParam } from '~/http/pagination';
import { movieDetail, movieListItem } from './serializers';

/** Fixed: v1 doesn't accept `per_page` (Q-11). */
const PER_PAGE = 24;

/** Legacy answered 200 with this body (Q-03); the frontend can't render the page either way. */
const NOT_FOUND = 'Erro catastrófico.';

export function createMovieRoutes({ movieService }: { movieService: MovieService }) {
  return new Hono()
    .get('/', zValidator('query', z.object({ page: pageParam(PER_PAGE) })), async c => {
      const pageRequest = { page: c.req.valid('query').page, perPage: PER_PAGE };
      const { items, total } = await movieService.listRated({ limit: PER_PAGE, offset: offsetOf(pageRequest) });

      return c.json(lengthAwarePage({ items: items.map(movieListItem), total }, pageRequest, c.req.url));
    })
    .get('/random', async c => {
      const movie = await movieService.findRandomRecommended();
      if (!movie) throw new ApiError(404, NOT_FOUND);

      return c.json({ success: true, data: movieDetail(movie, { withUsers: false }) });
    })
    // Digits only: anything else falls through to the generic 404 (legacy crashed with a 500).
    .get('/:id{[0-9]{1,15}}', async c => {
      const movie = await movieService.findDetail(Number(c.req.param('id')));
      if (!movie) throw new ApiError(404, NOT_FOUND);

      return c.json({ success: true, data: movieDetail(movie, { withUsers: true }) });
    });
}
