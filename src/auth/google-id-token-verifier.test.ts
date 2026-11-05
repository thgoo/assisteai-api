import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
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

function verifier(options: { now?: () => number; failing?: () => boolean } = {}) {
  let jwksFetches = 0;
  const instance = new GoogleIdTokenVerifier({
    clientId: CLIENT_ID,
    jwksUrl: 'https://keys.test/certs',
    timeoutMs: 1000,
    now: options.now,
    fetch: () => {
      jwksFetches += 1;
      if (options.failing?.() === true) return Promise.resolve(new Response('unavailable', { status: 503 }));
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

  test('Google\'s keys failing to load throws, so it is told apart from an invalid token', async () => {
    const instance = new GoogleIdTokenVerifier({
      clientId: CLIENT_ID,
      jwksUrl: 'https://keys.test/certs',
      timeoutMs: 1000,
      fetch: () => Promise.resolve(new Response('unavailable', { status: 503 })),
    });

    const token = await sign(claims(), privateJwk, 'RS256');
    const failure = await instance.verify(token).then(() => undefined, (error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('503');
  });

  describe('refetches for unknown kids', () => {
    let clock = 0;
    const tick = (ms: number) => { clock += ms; };
    const known = () => sign(claims(), privateJwk, 'RS256');
    const withKid = (kid: string) => sign(claims(), { ...privateJwk, kid }, 'RS256');
    const fails = (promise: Promise<unknown>) => promise.then(() => false, () => true);

    beforeEach(() => {
      clock = 1_000_000;
    });

    async function primed(options: { failing?: () => boolean } = {}) {
      const subject = verifier({ ...options, now: () => clock });
      expect(await subject.instance.verify(await known())).toBeDefined();
      expect(subject.fetches()).toBe(1);
      return subject;
    }

    test('after a miss, unknown kids are rejected without a fetch for 10 s', async () => {
      const { instance, fetches } = await primed();

      expect(await instance.verify(await withKid('x1'))).toBeUndefined();
      expect(fetches()).toBe(2);

      tick(5_000);
      expect(await instance.verify(await withKid('x2'))).toBeUndefined();
      expect(fetches()).toBe(2);

      tick(6_000);
      expect(await instance.verify(await withKid('x3'))).toBeUndefined();
      expect(fetches()).toBe(3);
    });

    test('the known kid keeps verifying during the cooldown, with no fetch', async () => {
      const { instance, fetches } = await primed();
      await instance.verify(await withKid('x1'));

      tick(5_000);
      expect(await instance.verify(await known())).toMatchObject({ sub: '1001' });
      expect(fetches()).toBe(2);
    });

    test('expired keys are refetched despite the cooldown', async () => {
      const { instance, fetches } = await primed();
      await instance.verify(await withKid('x1'));

      tick(3_600_000);
      expect(await instance.verify(await withKid('x2'))).toBeUndefined();
      expect(fetches()).toBe(3);
    });

    test('a failed refetch throws, and unknown kids keep throwing without a fetch for 10 s', async () => {
      let failing = false;
      const { instance, fetches } = await primed({ failing: () => failing });

      failing = true;
      expect(await fails(instance.verify(await withKid('x1')))).toBe(true);
      expect(fetches()).toBe(2);

      tick(5_000);
      expect(await fails(instance.verify(await withKid('x2')))).toBe(true);
      expect(fetches()).toBe(2);

      tick(6_000);
      expect(await fails(instance.verify(await withKid('x3')))).toBe(true);
      expect(fetches()).toBe(3);
    });

    test('a refetch that works but lacks the kid gives undefined, also inside the cooldown', async () => {
      const { instance, fetches } = await primed();

      expect(await fails(instance.verify(await withKid('x1')))).toBe(false);
      tick(5_000);
      const second = instance.verify(await withKid('x2'));

      expect(await fails(second)).toBe(false);
      expect(await second).toBeUndefined();
      expect(fetches()).toBe(2);
    });

    test('a successful refetch after a failed one clears the failure', async () => {
      let failing = false;
      const { instance, fetches } = await primed({ failing: () => failing });

      failing = true;
      expect(await fails(instance.verify(await withKid('x1')))).toBe(true);

      failing = false;
      tick(11_000);
      expect(await instance.verify(await withKid('x2'))).toBeUndefined();
      expect(fetches()).toBe(3);

      tick(5_000);
      expect(await instance.verify(await withKid('x3'))).toBeUndefined();
      expect(fetches()).toBe(3);
    });

    test('the known kid on fresh keys keeps verifying during a failure cooldown, with no fetch', async () => {
      let failing = false;
      const { instance, fetches } = await primed({ failing: () => failing });

      failing = true;
      expect(await fails(instance.verify(await withKid('x1')))).toBe(true);

      tick(5_000);
      expect(await instance.verify(await known())).toMatchObject({ sub: '1001' });
      expect(fetches()).toBe(2);
    });

    test('a failed fetch on an empty cache starts the failure cooldown', async () => {
      let failing = true;
      const { instance, fetches } = verifier({ now: () => clock, failing: () => failing });

      expect(await fails(instance.verify(await known()))).toBe(true);
      expect(fetches()).toBe(1);

      tick(5_000);
      failing = false;
      expect(await fails(instance.verify(await known()))).toBe(true);
      expect(await fails(instance.verify(await withKid('x1')))).toBe(true);
      expect(fetches()).toBe(1);

      tick(6_000);
      expect(await instance.verify(await known())).toMatchObject({ sub: '1001' });
      expect(fetches()).toBe(2);
    });

    test('a failed fetch on an expired cache starts the failure cooldown', async () => {
      let failing = false;
      const { instance, fetches } = await primed({ failing: () => failing });

      tick(3_600_000);
      failing = true;
      expect(await fails(instance.verify(await known()))).toBe(true);
      expect(fetches()).toBe(2);

      tick(5_000);
      failing = false;
      expect(await fails(instance.verify(await known()))).toBe(true);
      expect(fetches()).toBe(2);

      tick(6_000);
      expect(await instance.verify(await known())).toMatchObject({ sub: '1001' });
      expect(fetches()).toBe(3);
    });

    test('concurrent verifications on an empty cache share one fetch', async () => {
      const { instance, fetches } = verifier({ now: () => clock });
      const tokens = await Promise.all(['x1', 'x2', 'x3', 'x4', 'x5'].map(withKid));

      const results = await Promise.all(tokens.map(token => instance.verify(token)));

      expect(results).toEqual([undefined, undefined, undefined, undefined, undefined]);
      expect(fetches()).toBe(1);
    });

    test('the first refetch on an empty cache that finds the kid starts no cooldown', async () => {
      const { instance, fetches } = await primed();

      expect(await instance.verify(await withKid('x1'))).toBeUndefined();
      expect(fetches()).toBe(2);
    });
  });
});
