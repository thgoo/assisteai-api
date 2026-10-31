import { Hono } from 'hono';
import { z } from 'zod';
import type { RatingService, RatingTarget } from './rating-service';
import type { SessionService } from '~/auth/session-service';
import type { SessionCookie, SessionEnv } from '~/http/session-cookie';
import { RATING_KEYS } from '~/domain/ratings';
import { rateLimit } from '~/http/rate-limit';
import { requireSession } from '~/http/session-cookie';
import { validate } from '~/http/validation';

const MESSAGES = {
  titleRequired: 'Informe o título.',
  urlRequired: 'Informe o link do IMDb ou do TMDb.',
  ratingRequired: 'Escolha uma avaliação.',
  commentTooLong: 'O comentário pode ter no máximo 2000 caracteres.',
};

/** Rates either a title by its link or a movie already here by its id: exactly one of `url` and `movieId`. */
const newRatingBody = z.object({
  url: z.string({ error: MESSAGES.urlRequired }).trim().min(1, MESSAGES.urlRequired).optional(),
  movieId: z.int32({ error: MESSAGES.titleRequired }).positive(MESSAGES.titleRequired).optional(),
  rating: z.enum(RATING_KEYS, { error: MESSAGES.ratingRequired }),
  /** Empty or missing: no comment. */
  comment: z.string().trim().max(2000, MESSAGES.commentTooLong).nullish()
    .transform(value => (value === undefined || value === '' ? null : value)),
}).transform(({ url, movieId, ...rest }, ctx) => {
  const target: RatingTarget | undefined = url === undefined
    ? movieId === undefined ? undefined : { movieId }
    : movieId === undefined ? { url } : undefined;
  if (target) return { ...rest, target };
  ctx.addIssue({ code: 'custom', message: MESSAGES.titleRequired });
  return z.NEVER;
});

export interface RatingDependencies {
  ratingService: RatingService;
  sessionService: SessionService;
  sessionCookie: SessionCookie;
  /** Rating attempts per user per minute (each new title costs TMDb calls and a Telegram message). */
  ratingsPerMinute: number;
}

export function createRatingRoutes(deps: RatingDependencies) {
  const { ratingService, sessionService, sessionCookie, ratingsPerMinute } = deps;
  const perUser = rateLimit<SessionEnv>({ max: ratingsPerMinute, windowMs: 60_000, key: c => String(c.get('userId')) });

  return new Hono<SessionEnv>()
    .post('/', requireSession(sessionCookie, sessionService), perUser, validate('json', newRatingBody), async c => {
      const movie = await ratingService.create({ userId: c.get('userId'), ...c.req.valid('json') });
      return c.json({ movie: { id: movie.id, slug: movie.slug } }, 201);
    });
}
