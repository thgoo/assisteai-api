import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { GoogleAccount } from './support/mock';
import { users } from '../fixtures/dataset';
import { resetDatabase } from './support/database';
import { get, post, sessionCookie } from './support/http';
import { googleIdToken } from './support/mock';
import { userById } from './support/oracle';
import { problemSchema, userResponseSchema } from './support/schemas';

const ana = userById(1);
const anaAtGoogle: GoogleAccount = {
  sub: ana.googleSub ?? '', email: ana.email, name: ana.name, picture: ana.avatarUrl ?? undefined,
};

async function signIn(account: GoogleAccount, overrides: Record<string, unknown> = {}) {
  return post('/auth/google', { json: { credential: await googleIdToken(account, overrides) } });
}

/** Signs in and returns the session cookie value. */
async function sessionFor(account: GoogleAccount): Promise<string> {
  const response = await signIn(account);
  expect(response.status).toBe(200);
  const cookie = sessionCookie(response);
  if (!cookie) throw new Error('No session cookie');
  return cookie.value;
}

async function me(session?: string) {
  return get('/me', session === undefined ? {} : { session });
}

describe('auth', () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);

  describe('POST /auth/google', () => {
    test('a known Google account: its user, and a secure session cookie', async () => {
      const response = await signIn(anaAtGoogle);

      expect(response.status).toBe(200);
      expect(userResponseSchema.parse(response.body)).toEqual({
        user: { name: ana.name, email: ana.email, avatarUrl: ana.avatarUrl },
      });
      const cookie = sessionCookie(response);
      expect(cookie?.value).toMatch(/^[\w-]{43}$/);
      expect(cookie?.attributes).toContain('HttpOnly');
      expect(cookie?.attributes).toContain('Secure');
      expect(cookie?.attributes).toContain('SameSite=Lax');
      expect(cookie?.attributes).toContain('Path=/');
    });

    test('an account without Google sign-in yet is linked by email, then found by its Google id', async () => {
      const bruno = userById(2);
      const brunoAtGoogle = { sub: '200000000000000000002', email: bruno.email, name: 'Bruno L.' };

      const first = await me(await sessionFor(brunoAtGoogle));
      const second = await me(await sessionFor({ ...brunoAtGoogle, email: 'bruno.new@example.com' }));

      expect(userResponseSchema.parse(first.body).user).toMatchObject({ email: bruno.email, name: 'Bruno L.' });
      expect(userResponseSchema.parse(second.body).user.email).toBe(bruno.email);
    });

    test('a new Google account creates a user', async () => {
      const newcomer = { sub: '300000000000000000099', email: 'diego@example.com', name: 'Diego Novo' };
      const response = await me(await sessionFor(newcomer));

      expect(userResponseSchema.parse(response.body).user).toEqual({
        name: 'Diego Novo', email: 'diego@example.com', avatarUrl: null,
      });
      expect(users.map(u => u.email)).not.toContain('diego@example.com');
    });

    test('name and avatar are refreshed from Google on every sign-in', async () => {
      const renamed = { ...anaAtGoogle, name: 'Ana S.', picture: 'https://lh3.googleusercontent.com/a/ana-new' };
      const response = await me(await sessionFor(renamed));

      expect(userResponseSchema.parse(response.body).user).toMatchObject({
        name: 'Ana S.', avatarUrl: 'https://lh3.googleusercontent.com/a/ana-new',
      });
    });

    test.each([
      ['issued for another app', { aud: 'another.apps.googleusercontent.com' }],
      ['with an unverified email', { email_verified: false }],
      ['expired', { iat: 1_700_000_000, exp: 1_700_003_600 }],
    ])('an ID token %s: 401, no cookie', async (_, overrides) => {
      const response = await signIn(anaAtGoogle, overrides);

      expect(response.status).toBe(401);
      expect(problemSchema.parse(response.body).detail).toBe('Não foi possível entrar com o Google. Tente de novo.');
      expect(sessionCookie(response)).toBeUndefined();
    });

    test('garbage instead of an ID token: 401', async () => {
      expect((await post('/auth/google', { json: { credential: 'not-a-jwt' } })).status).toBe(401);
    });

    test('no credential: 422', async () => {
      const response = await post('/auth/google', { json: {} });

      expect(response.status).toBe(422);
      expect(problemSchema.parse(response.body).detail).toBe('Credencial do Google ausente.');
    });

    test('from a page on another site: 403 (CSRF)', async () => {
      const credential = await googleIdToken(anaAtGoogle);
      const headers = { Origin: 'https://evil.example' };
      const response = await post('/auth/google', { json: { credential }, headers });

      expect(response.status).toBe(403);
      expect(sessionCookie(response)).toBeUndefined();
    });
  });

  describe('GET /me', () => {
    test('without a session: 401', async () => {
      const response = await me();

      expect(response.status).toBe(401);
      expect(problemSchema.parse(response.body).detail).toBe('Faça login para continuar.');
    });

    test('with an unknown session: 401', async () => {
      expect((await me('made-up-session-token')).status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    test('ends the session and clears the cookie', async () => {
      const session = await sessionFor(anaAtGoogle);
      const response = await post('/auth/logout', { session });

      expect(response.status).toBe(204);
      expect(sessionCookie(response)?.attributes).toMatch(/Max-Age=0/);
      expect((await me(session)).status).toBe(401);
    });

    test('without a session: still 204', async () => {
      expect((await post('/auth/logout')).status).toBe(204);
    });
  });
});
