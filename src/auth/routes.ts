import { Hono } from 'hono';
import { z } from 'zod';
import type { GoogleIdTokenVerifier } from './google-id-token-verifier';
import type { SessionService } from './session-service';
import type { UserRepository } from './user-repository';
import type { SessionCookie, SessionEnv } from '~/http/session-cookie';
import { ProblemError } from '~/http/errors';
import { requireSession } from '~/http/session-cookie';
import { validate } from '~/http/validation';
import { userResource } from './serializers';

export interface AuthDependencies {
  googleIdTokenVerifier: GoogleIdTokenVerifier;
  sessionService: SessionService;
  sessionCookie: SessionCookie;
  userRepository: UserRepository;
}

const signInBody = z.object({ credential: z.string({ error: 'Credencial do Google ausente.' }).min(1) });

export function createAuthRoutes(deps: AuthDependencies) {
  const { googleIdTokenVerifier, sessionService, sessionCookie, userRepository } = deps;
  const signedIn = requireSession(sessionCookie, sessionService);

  return new Hono<SessionEnv>()
    .post('/auth/google', validate('json', signInBody), async c => {
      const identity = await googleIdTokenVerifier.verify(c.req.valid('json').credential);
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
