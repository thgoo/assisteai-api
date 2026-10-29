import { beforeAll, describe, expect, test } from 'bun:test';
import { sign } from 'hono/jwt';
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws';
import { GoogleIdTokenVerifier } from './google-id-token-verifier';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const now = () => Math.floor(Date.now() / 1000);

let privateJwk: HonoJsonWebKey;
let publicJwk: { kty?: string; n?: string; e?: string };

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateJwk = { ...(await crypto.subtle.exportKey('jwk', pair.privateKey)), kid: 'k1' };
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1001',
    email: 'ana@example.com',
    email_verified: true,
    name: 'Ana Souza',
    picture: 'https://lh3.googleusercontent.com/a/ana',
    iat: now(),
    exp: now() + 3600,
    ...overrides,
  };
}

function verifier() {
  let jwksFetches = 0;
  const instance = new GoogleIdTokenVerifier({
    clientId: CLIENT_ID,
    jwksUrl: 'https://keys.test/certs',
    timeoutMs: 1000,
    fetch: () => {
      jwksFetches += 1;
      const { kty, n, e } = publicJwk;
      return Promise.resolve(Response.json(
        { keys: [{ kty, n, e, alg: 'RS256', kid: 'k1' }] },
        { headers: { 'Cache-Control': 'public, max-age=3600' } },
      ));
    },
  });
  return { instance, fetches: () => jwksFetches };
}

describe('GoogleIdTokenVerifier', () => {
  test('a valid ID token gives the identity', async () => {
    const { instance } = verifier();

    expect(await instance.verify(await sign(claims(), privateJwk, 'RS256'))).toEqual({
      sub: '1001', email: 'ana@example.com', name: 'Ana Souza', avatarUrl: 'https://lh3.googleusercontent.com/a/ana',
    });
  });

  test('caches Google\'s keys between sign-ins', async () => {
    const { instance, fetches } = verifier();
    const token = await sign(claims(), privateJwk, 'RS256');
    await instance.verify(token);
    await instance.verify(token);

    expect(fetches()).toBe(1);
  });

  test.each([
    ['another app (aud)', { aud: 'other.apps.googleusercontent.com' }],
    ['another issuer', { iss: 'https://evil.example' }],
    ['an expired token', { iat: now() - 7200, exp: now() - 3600 }],
    ['an unverified email', { email_verified: false }],
  ])('rejects %s', async (_, overrides) => {
    const { instance } = verifier();
    expect(await instance.verify(await sign(claims(overrides), privateJwk, 'RS256'))).toBeUndefined();
  });

  test('rejects tokens signed with another key, HS256 tokens and garbage', async () => {
    const { instance } = verifier();
    const other = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign'],
    );
    const otherJwk = { ...(await crypto.subtle.exportKey('jwk', other.privateKey)), kid: 'k1' } as HonoJsonWebKey;

    expect(await instance.verify(await sign(claims(), otherJwk, 'RS256'))).toBeUndefined();
    expect(await instance.verify(await sign(claims(), 'secret', 'HS256'))).toBeUndefined();
    expect(await instance.verify('not-a-jwt')).toBeUndefined();
  });
});
