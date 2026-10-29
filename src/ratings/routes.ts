import { Hono } from 'hono';
import { z } from 'zod';
import type { RatingService } from './rating-service';
import type { SessionService } from '~/auth/session-service';
import type { SessionCookie, SessionEnv } from '~/http/session-cookie';
import { RATING_KEYS } from '~/domain/ratings';
import { requireSession } from '~/http/session-cookie';
import { validate } from '~/http/validation';

const MESSAGES = {
  urlRequired: 'Informe o link do IMDb ou do TMDb.',
  ratingRequired: 'Escolha uma avaliação.',
  commentTooLong: 'O comentário pode ter no máximo 2000 caracteres.',
};

const newRatingBody = z.object({
  url: z.string({ error: MESSAGES.urlRequired }).trim().min(1, MESSAGES.urlRequired),
  rating: z.enum(RATING_KEYS, { error: MESSAGES.ratingRequired }),
  /** Empty or missing: no comment. */
  comment: z.string().trim().max(2000, MESSAGES.commentTooLong).nullish()
    .transform(value => (value === undefined || value === '' ? null : value)),
});

export interface RatingDependencies {
  ratingService: RatingService;
  sessionService: SessionService;
  sessionCookie: SessionCookie;
}

export function createRatingRoutes({ ratingService, sessionService, sessionCookie }: RatingDependencies) {
  return new Hono<SessionEnv>()
    .post('/', requireSession(sessionCookie, sessionService), validate('json', newRatingBody), async c => {
      const movie = await ratingService.create({ userId: c.get('userId'), ...c.req.valid('json') });
      return c.json({ movie: { id: movie.id, slug: movie.slug } }, 201);
    });
}
