import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { GoogleUser } from './support/mock';
import { users } from '../fixtures/dataset';
import { resetDatabase } from './support/database';
import { post } from './support/http';
import { decodeClaims, LEGACY_PRV, nowInSeconds, TOKEN_TTL_SECONDS } from './support/jwt';
import { registerGoogleToken, resetMock } from './support/mock';
import { userById } from './support/oracle';
import { errorResponseSchema, loginResponseSchema, statusErrorSchema } from './support/schemas';
import { byTarget, target } from './support/target';

const TOLERANCE_SECONDS = 60;

function googleUserFor(userId: number): GoogleUser {
  const user = userById(userId);
  return { sub: user.providerId, name: user.name, email: user.email, picture: user.avatar ?? '' };
}

async function loginWithGoogle(token: string) {
  return post('/auth/login/google', { json: { token } });
}

async function login(token: string, googleUser: GoogleUser) {
  await registerGoogleToken(token, googleUser);
  const response = await loginWithGoogle(token);
  expect(response.status).toBe(200);
  return { raw: response.body as { user: object }, body: loginResponseSchema.parse(response.body) };
}

/** `Y-m-d H:i:s` in São Paulo, parsed back to epoch seconds (the format of `last_login_at`). */
function saoPauloLocalToEpoch(value: string): number {
  const asIfUtc = Date.parse(`${value.replace(' ', 'T')}Z`) / 1000;
  const offsetHours = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', timeZoneName: 'shortOffset',
  }).formatToParts(asIfUtc * 1000).find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') ?? 0);
  return asIfUtc - offsetHours * 3600;
}

describe('POST /auth/login/google', () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);
  beforeEach(resetMock);

  test('an existing Google user gets a token for their own account and their <User>', async () => {
    const fixture = userById(1);
    const { body } = await login('google-token-ana', googleUserFor(1));

    expect(body.user).toMatchObject({
      name: fixture.name,
      email: fixture.email,
      avatar: fixture.avatar,
      theme: fixture.theme,
      created_at: '2015-09-11T20:26:44.000000Z',
    });
    expect(decodeClaims(body.access_token).sub).toBe(String(fixture.id));
  });

  test('the token carries the legacy claims, so the other implementation accepts it (rollback safety)', async () => {
    const { body } = await login('google-token-claims', googleUserFor(1));
    const claims = decodeClaims(body.access_token);

    expect(claims.prv).toBe(LEGACY_PRV);
    expect(Math.abs(claims.iat - nowInSeconds())).toBeLessThan(TOLERANCE_SECONDS);
    expect(claims.nbf).toBe(claims.iat);
    expect(claims.exp - claims.iat).toBe(TOKEN_TTL_SECONDS);
    expect(claims.jti).not.toBe('');
  });

  test('last_login_at is set to now, as São Paulo local time', async () => {
    const { body } = await login('google-token-last-login', googleUserFor(3));
    expect(Math.abs(saoPauloLocalToEpoch(body.user.last_login_at) - nowInSeconds())).toBeLessThan(TOLERANCE_SECONDS);
  });

  test('name and avatar are refreshed from Google on every login', async () => {
    const renamed = { ...googleUserFor(3), name: 'Carla D.', picture: 'https://lh3.googleusercontent.com/a/carla-new' };
    const { body } = await login('google-token-renamed', renamed);

    expect(body.user).toMatchObject({ name: 'Carla D.', avatar: 'https://lh3.googleusercontent.com/a/carla-new' });
    expect(decodeClaims(body.access_token).sub).toBe('3');
  });

  test('a Facebook-era user signing in with Google keeps their account (matched by email)', async () => {
    const bruno = userById(2);
    const { body } = await login('google-token-bruno', {
      sub: '100000000000000000002',
      name: bruno.name,
      email: bruno.email,
      picture: 'https://lh3.googleusercontent.com/a/bruno',
    });

    expect(decodeClaims(body.access_token).sub).toBe(String(bruno.id));
  });

  test('a new Google account creates a user, and logging in again lands on the same user', async () => {
    const newcomer = {
      sub: '100000000000000000099',
      name: 'Diego Novo',
      email: 'diego@example.com',
      picture: 'https://lh3.googleusercontent.com/a/diego',
    };
    const first = await login('google-token-diego-1', newcomer);
    const second = await login('google-token-diego-2', newcomer);

    expect(first.body.user).toMatchObject({ name: 'Diego Novo', email: 'diego@example.com', avatar: newcomer.picture });
    // Legacy serializes the freshly created model, which has no `theme` attribute yet; the new app sends null.
    expect('theme' in first.raw.user).toBe(byTarget({ legacy: false, new: true }));
    expect(second.body.user.theme).toBeNull();
    const firstId = Number(decodeClaims(first.body.access_token).sub);
    expect(users.map(u => u.id)).not.toContain(firstId);
    expect(decodeClaims(second.body.access_token).sub).toBe(String(firstId));
  });

  test('the new app drops `gender` from <User> (unused, doc 02 Phase 3)', async () => {
    const { raw } = await login('google-token-gender', googleUserFor(1));
    expect('gender' in raw.user).toBe(byTarget({ legacy: true, new: false }));
  });

  test('a token Google rejects is a 401 "Token inválido."', async () => {
    const response = await loginWithGoogle('not-a-google-token');

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body)).toEqual({ success: false, message: 'Token inválido.' });
  });

  test('a missing token is a 401 "Token inválido."', async () => {
    const response = await post('/auth/login/google', { json: {} });

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body)).toEqual({ success: false, message: 'Token inválido.' });
  });

  // Legacy passes any provider to Socialite (Facebook would reach the real Graph API): new app only.
  test.if(target === 'new')('providers other than Google don\'t exist on the new app (Q-06)', async () => {
    const response = await post('/auth/login/facebook', { json: { token: 'whatever' } });

    expect(response.status).toBe(404);
    expect(statusErrorSchema.parse(response.body)).toEqual({ success: false, status: 404, message: 'HTTP_NOT_FOUND' });
  });
});
