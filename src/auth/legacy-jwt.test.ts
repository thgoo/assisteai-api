import { describe, expect, test } from 'bun:test';
import { sign } from 'hono/jwt';
import { LEGACY_PRV, LegacyJwt, nowInSeconds } from './legacy-jwt';

const SECRET = 'local-legacy-env-jwt-secret-must-be-at-least-256-bits-long-0123456789';
const TTL = 7200;
const jwt = new LegacyJwt({ secret: SECRET, ttlSeconds: TTL });

/** Issued by the legacy PHP app (local env, same secret) on a Google login, 2026-10-29 (expired since). */
const PHP_TOKEN = [
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9',
  'eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwMDAvYXV0aC9sb2dpbi9nb29nbGUiLCJpYXQiOjE3OTMyODA5NjcsImV4cCI6MTc5MzI4ODE2NywibmJm'
  + 'IjoxNzkzMjgwOTY3LCJqdGkiOiJQTWE1eFMyb08xeHFadDNPIiwic3ViIjoiMSIsInBydiI6IjIzYmQ1Yzg5NDlmNjAwYWRiMzllNzAxYzQwMDg3'
  + 'MmRiN2E1OTc2ZjcifQ',
  'k5i9sZAaxz5m-l7V8hYc6OQs8y78qhayyGs_ozvJzUA',
].join('.');

function legacyClaims(overrides: Record<string, unknown> = {}) {
  const iat = nowInSeconds();
  return {
    iss: 'http://test/auth/login/google', iat, exp: iat + TTL, nbf: iat, jti: 'abc', sub: '1', prv: LEGACY_PRV,
    ...overrides,
  };
}

describe('LegacyJwt', () => {
  test('accepts a token issued by the legacy PHP app', async () => {
    expect(await jwt.verify(PHP_TOKEN, { allowExpired: true })).toEqual({
      iss: 'http://localhost:8000/auth/login/google',
      iat: 1793280967,
      exp: 1793288167,
      nbf: 1793280967,
      jti: 'PMa5xS2oO1xqZt3O',
      sub: '1',
      prv: LEGACY_PRV,
    });
  });

  test('rejects expired tokens unless asked to allow them (refresh)', async () => {
    const iat = nowInSeconds() - TTL - 60;
    const expired = await sign(legacyClaims({ iat, nbf: iat, exp: iat + TTL }), SECRET, 'HS256');

    expect(await jwt.verify(expired)).toBeUndefined();
    expect(await jwt.verify(expired, { allowExpired: true })).toMatchObject({ sub: '1' });
  });

  test('rejects a token signed with another secret', async () => {
    const other = new LegacyJwt({ secret: 'another-secret-that-is-at-least-256-bits-long-000000', ttlSeconds: TTL });
    expect(await other.verify(PHP_TOKEN, { allowExpired: true })).toBeUndefined();
  });

  test('signs the legacy claims: TTL expiry, nbf = now, a 16-char jti, the user model prv', async () => {
    const claims = await jwt.verify(await jwt.sign({ sub: 42, iss: 'http://api.test/auth/login/google' }));

    expect(claims).toMatchObject({ iss: 'http://api.test/auth/login/google', sub: '42', prv: LEGACY_PRV });
    expect(claims?.exp).toBe((claims?.iat ?? 0) + TTL);
    expect(claims?.nbf).toBe(claims?.iat);
    expect(claims?.jti).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  test('keeps a given iat (refresh), with a fresh exp', async () => {
    const iat = nowInSeconds() - 3600;
    const claims = await jwt.verify(await jwt.sign({ sub: 1, iss: 'http://api.test/auth/refresh', iat }));

    expect(claims?.iat).toBe(iat);
    expect(claims?.exp).toBe(nowInSeconds() + TTL);
  });

  test.each([
    ['another model (prv)', { prv: 'not-the-user-model' }],
    ['a non-numeric subject', { sub: 'admin' }],
    ['a missing jti', { jti: undefined }],
    ['an iat in the future', { iat: nowInSeconds() + 3600 }],
  ])('rejects %s', async (_, overrides) => {
    expect(await jwt.verify(await sign(legacyClaims(overrides), SECRET, 'HS256'))).toBeUndefined();
  });

  test('rejects garbage and unsigned tokens', async () => {
    const unsigned = `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(JSON.stringify(legacyClaims()))}.`;
    expect(await jwt.verify('not-a-jwt')).toBeUndefined();
    expect(await jwt.verify(unsigned)).toBeUndefined();
  });
});
