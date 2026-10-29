import { Hono } from 'hono';
import { z } from 'zod';
import type { TitleSearchService } from './title-search-service';
import type { SessionService } from '~/auth/session-service';
import type { SessionCookie, SessionEnv } from '~/http/session-cookie';
import { rateLimit } from '~/http/rate-limit';
import { requireSession } from '~/http/session-cookie';
import { validate } from '~/http/validation';
import { titleResult } from './serializers';

const MESSAGES = {
  tooShort: 'Digite pelo menos 2 letras.',
  tooLong: 'A busca pode ter no máximo 100 caracteres.',
};

const searchQuery = z.object({
  q: z.string({ error: MESSAGES.tooShort }).trim().min(2, MESSAGES.tooShort).max(100, MESSAGES.tooLong),
});

export interface TitleDependencies {
  titleSearchService: TitleSearchService;
  sessionService: SessionService;
  sessionCookie: SessionCookie;
  /** Searches per user per minute (each one is a TMDb call; the front debounces typing). */
  searchesPerMinute: number;
}

export function createTitleRoutes(deps: TitleDependencies) {
  const { titleSearchService, sessionService, sessionCookie, searchesPerMinute } = deps;
  const perUser = rateLimit<SessionEnv>({
    max: searchesPerMinute,
    windowMs: 60_000,
    key: c => String(c.get('userId')),
  });

  return new Hono<SessionEnv>()
    .get('/search', requireSession(sessionCookie, sessionService), perUser, validate('query', searchQuery), async c => {
      const results = await titleSearchService.search(c.get('userId'), c.req.valid('query').q);

      // Per user (ratedByMe), and short: a rating made meanwhile shows up a minute later at most.
      c.header('Cache-Control', 'private, max-age=60');
      return c.json({ data: results.map(titleResult) });
    });
}
