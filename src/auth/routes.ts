import { Hono } from 'hono';
import { z } from 'zod';
import type { GoogleClient } from './google-client';
import type { TokenService } from './token-service';
import type { UserRepository } from './user-repository';
import type { AuthEnv } from '~/http/auth';
import { bearerToken, requireAuth } from '~/http/auth';
import { ApiError, statusError } from '~/http/errors';
import { tokenResource, userResource } from './serializers';

const INVALID_GOOGLE_TOKEN = 'Token inválido.';

const loginBody = z.object({ token: z.string().min(1) });

export interface AuthRoutesDependencies {
  tokenService: TokenService;
  googleClient: GoogleClient;
  userRepository: UserRepository;
}

export function createAuthRoutes({ tokenService, googleClient, userRepository }: AuthRoutesDependencies) {
  return new Hono<AuthEnv>()
    // Only Google: other providers don't exist anymore (Q-06), so `/login/facebook` is a plain 404.
    .post('/login/google', async c => {
      const body = loginBody.safeParse(await c.req.json<unknown>().catch(() => null));
      const googleUser = body.success ? await googleClient.userInfo(body.data.token) : undefined;
      if (!googleUser) throw new ApiError(401, INVALID_GOOGLE_TOKEN);

      const user = await userRepository.upsertFromGoogle(googleUser);
      const issued = await tokenService.issue(user.id, c.req.url);
      return c.json({ ...tokenResource(issued), user: userResource(user) });
    })
    .get('/me', requireAuth(tokenService), async c => {
      const user = await userRepository.findById(c.get('userId'));
      if (!user) return statusError(c, 401);

      return c.json({ success: true, user: userResource(user) });
    })
    // Accepts expired tokens inside the refresh window. Failures are 401 (legacy: 500, Q-02).
    .post('/refresh', async c => {
      const token = bearerToken(c.req.header('Authorization'));
      const issued = token === undefined ? undefined : await tokenService.refresh(token, c.req.url);
      if (!issued) return statusError(c, 401);

      return c.json(tokenResource(issued));
    });
}
