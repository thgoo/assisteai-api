import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { MovieService } from './movie-service';
import { lengthAwarePage, offsetOf, pageParam } from '~/http/pagination';
import { movieListItem } from './serializers';

/** Fixed: v1 doesn't accept `per_page` (Q-11). */
const PER_PAGE = 24;

export function createMovieRoutes({ movieService }: { movieService: MovieService }) {
  return new Hono()
    .get('/', zValidator('query', z.object({ page: pageParam(PER_PAGE) })), async c => {
      const pageRequest = { page: c.req.valid('query').page, perPage: PER_PAGE };
      const { items, total } = await movieService.listRated({ limit: PER_PAGE, offset: offsetOf(pageRequest) });

      return c.json(lengthAwarePage({ items: items.map(movieListItem), total }, pageRequest, c.req.url));
    });
}
