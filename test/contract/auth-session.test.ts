import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { resetDatabase } from './support/database';
import { get, post } from './support/http';
import { decodeClaims, mintToken, nowInSeconds, REFRESH_WINDOW_SECONDS, TOKEN_TTL_SECONDS } from './support/jwt';
import { userById } from './support/oracle';
import { meResponseSchema, statusErrorSchema, tokenResponseSchema } from './support/schemas';
import { byTarget } from './support/target';

const UNAUTHORIZED = { success: false, status: 401, message: 'HTTP_UNAUTHORIZED' } as const;
const HOUR = 3600;

/** Refresh failures: 500 on legacy (Q-02), 401 on the new app. The front treats both as "log out". */
const REFRESH_FAILURE = byTarget({
  legacy: { status: 500, body: { success: false, status: 500, message: 'HTTP_INTERNAL_SERVER_ERROR' } as const },
  new: { status: 401, body: UNAUTHORIZED },
});

async function me(token?: string) {
  return get('/auth/me', token === undefined ? {} : { token });
}

async function refresh(token?: string) {
  return post('/auth/refresh', token === undefined ? {} : { token });
}

async function expectUnauthorized(responsePromise: ReturnType<typeof me>) {
  const response = await responsePromise;
  expect(response.status).toBe(401);
  expect(statusErrorSchema.parse(response.body)).toEqual(UNAUTHORIZED);
}

async function expectRefreshFailure(responsePromise: ReturnType<typeof refresh>) {
  const response = await responsePromise;
  expect(response.status).toBe(REFRESH_FAILURE.status);
  expect(statusErrorSchema.parse(response.body)).toEqual(REFRESH_FAILURE.body);
}

describe('GET /auth/me', () => {
  test('returns the <User> of the token\'s subject', async () => {
    const fixture = userById(1);
    const response = await me(mintToken(fixture.id));

    expect(response.status).toBe(200);
    expect(meResponseSchema.parse(response.body).user).toMatchObject({
      name: fixture.name,
      email: fixture.email,
      avatar: fixture.avatar,
      theme: fixture.theme,
    });
  });

  test('without a token: 401 HTTP_UNAUTHORIZED', () => expectUnauthorized(me()));

  test('with garbage: 401', () => expectUnauthorized(me('not-a-jwt')));

  test('with a token signed by another secret: 401', () =>
    expectUnauthorized(me(mintToken(1, {}, 'another-secret-that-is-at-least-256-bits-long-000000'))));

  test('with an expired token: 401', () =>
    expectUnauthorized(me(mintToken(1, { iat: nowInSeconds() - 3 * HOUR, exp: nowInSeconds() - HOUR }))));

  test('with a token for another model (wrong prv): 401', () =>
    expectUnauthorized(me(mintToken(1, { prv: 'not-the-user-model' }))));
});

describe('POST /auth/refresh', () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);

  test('swaps a valid token for a new one (no `user` in the body), keeping the original iat', async () => {
    const original = mintToken(1);
    const response = await refresh(original);

    expect(response.status).toBe(200);
    const body = tokenResponseSchema.parse(response.body);
    expect('user' in (response.body as object)).toBe(false);

    const [oldClaims, newClaims] = [decodeClaims(original), decodeClaims(body.access_token)];
    expect(newClaims.sub).toBe('1');
    expect(newClaims.iat).toBe(oldClaims.iat);
    expect(newClaims.jti).not.toBe(oldClaims.jti);

    const meResponse = await me(body.access_token);
    expect(meResponse.status).toBe(200);
  });

  test('the old token is revoked: /auth/me rejects it and it can\'t be refreshed twice', async () => {
    const original = mintToken(1);
    expect((await refresh(original)).status).toBe(200);

    await expectUnauthorized(me(original));
    await expectRefreshFailure(refresh(original));
  });

  test('an expired token inside the refresh window can be refreshed', async () => {
    const expired = mintToken(1, { iat: nowInSeconds() - 3 * HOUR, exp: nowInSeconds() - HOUR });
    const response = await refresh(expired);

    expect(response.status).toBe(200);
    const { access_token: token } = tokenResponseSchema.parse(response.body);
    expect((await me(token)).status).toBe(200);
  });

  test('a refreshed token expires TTL after the refresh, not after the original iat', async () => {
    const issuedAt = nowInSeconds() - 3 * HOUR;
    const response = await refresh(mintToken(1, { iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS }));
    const { access_token: token } = tokenResponseSchema.parse(response.body);
    const claims = decodeClaims(token);

    expect(Math.abs(claims.exp - (nowInSeconds() + TOKEN_TTL_SECONDS))).toBeLessThan(60);
  });

  test('a token older than the refresh window (14 days from the original iat) is refused', () => {
    const issuedAt = nowInSeconds() - REFRESH_WINDOW_SECONDS - HOUR;
    return expectRefreshFailure(refresh(mintToken(1, { iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS })));
  });

  test('without a token: refused', () => expectRefreshFailure(refresh()));
});
