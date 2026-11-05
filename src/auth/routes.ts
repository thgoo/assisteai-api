import { Hono } from 'hono';
import { z } from 'zod';
import type { GoogleIdentity, GoogleIdTokenVerifier } from './google-id-token-verifier';
import type { SessionService } from './session-service';
import type { UserRepository } from './user-repository';
import type { SessionCookie, SessionEnv } from '~/http/session-cookie';
import type { Logger } from '~/logger';
import { ProblemError } from '~/http/errors';
import { clientIp, rateLimit } from '~/http/rate-limit';
import { requireSession } from '~/http/session-cookie';
import { validate } from '~/http/validation';
import { userResource } from './serializers';

export interface AuthDependencies {
  googleIdTokenVerifier: GoogleIdTokenVerifier;
  sessionService: SessionService;
  sessionCookie: SessionCookie;
  userRepository: UserRepository;
  /** Sign-in attempts per client IP per minute. */
  signInsPerMinute: number;
  logger: Logger;
}

const signInBody = z.object({ credential: z.string({ error: 'Credencial do Google ausente.' }).min(1) });

export function createAuthRoutes(deps: AuthDependencies) {
  const { googleIdTokenVerifier, sessionService, sessionCookie, userRepository, signInsPerMinute, logger } = deps;
  const signedIn = requireSession(sessionCookie, sessionService);
  const signInLimit = rateLimit<SessionEnv>({ max: signInsPerMinute, windowMs: 60_000, key: clientIp });

  return new Hono<SessionEnv>()
    .post('/auth/google', signInLimit, validate('json', signInBody), async c => {
      let identity: GoogleIdentity | undefined;
      try {
        identity = await googleIdTokenVerifier.verify(c.req.valid('json').credential);
      } catch (error) {
        // `verify` answers `undefined` for any invalid token: it only throws when Google's keys can't be fetched.
        logger.error('Google JWKS fetch failed', { error });
        throw new ProblemError(502, 'Não foi possível falar com o Google agora. Tente de novo.');
      }
      if (!identity) throw new ProblemError(401, 'Não foi possível entrar com o Google. Tente de novo.');

      const user = await userRepository.upsertFromGoogle(identity);
      sessionCookie.write(c, await sessionService.create(user.id));
      return c.json({ user: userResource(user) });
    })
    .get('/me', signedIn, async c => {
      const user = await userRepository.findById(c.get('userId'));
      if (!user) throw new ProblemError(401, 'Faça login para continuar.');

      return c.json({ user: userResource(user) });
    })
    .post('/auth/logout', async c => {
      const token = sessionCookie.read(c);
      if (token !== undefined) await sessionService.revoke(token);
      sessionCookie.clear(c);
      return c.body(null, 204);
    });
}
