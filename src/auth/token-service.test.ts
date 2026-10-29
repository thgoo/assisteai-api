import { beforeEach, describe, expect, test } from 'bun:test';
import { sign } from 'hono/jwt';
import type { RevokedTokens } from './revoked-token-repository';
import { LEGACY_PRV, LegacyJwt, nowInSeconds } from './legacy-jwt';
import { TokenService } from './token-service';

const SECRET = 'local-legacy-env-jwt-secret-must-be-at-least-256-bits-long-0123456789';
const TTL = 7200;
const WINDOW = 14 * 24 * 3600;
const ISSUER = 'http://api.test/auth/refresh';

class InMemoryRevokedTokens implements RevokedTokens {
  readonly revoked = new Map<string, Date>();

  isRevoked(jti: string): Promise<boolean> {
    return Promise.resolve(this.revoked.has(jti));
  }

  revoke(jti: string, expiresAt: Date): Promise<boolean> {
    if (this.revoked.has(jti)) return Promise.resolve(false);
    this.revoked.set(jti, expiresAt);
    return Promise.resolve(true);
  }
}

/** A token issued `ageSeconds` ago (expired once older than the TTL). */
function tokenIssuedAgo(ageSeconds: number, jti = 'jti-1') {
  const iat = nowInSeconds() - ageSeconds;
  return sign({ iss: 'http://legacy', iat, exp: iat + TTL, nbf: iat, jti, sub: '7', prv: LEGACY_PRV }, SECRET, 'HS256');
}

describe('TokenService', () => {
  const jwt = new LegacyJwt({ secret: SECRET, ttlSeconds: TTL });
  let revokedTokens: InMemoryRevokedTokens;
  let tokens: TokenService;

  beforeEach(() => {
    revokedTokens = new InMemoryRevokedTokens();
    tokens = new TokenService(jwt, revokedTokens, { refreshWindowSeconds: WINDOW });
  });

  test('authenticate: the user id of an issued token', async () => {
    const issued = await tokens.issue(7, 'http://api.test/auth/login/google');

    expect(issued.expiresInSeconds).toBe(TTL);
    expect(await tokens.authenticate(issued.token)).toBe(7);
  });

  test('authenticate: refuses expired and revoked tokens', async () => {
    expect(await tokens.authenticate(await tokenIssuedAgo(TTL + 60))).toBeUndefined();

    await revokedTokens.revoke('jti-1', new Date());
    expect(await tokens.authenticate(await tokenIssuedAgo(0))).toBeUndefined();
  });

  test('refresh: a new token for the same user and iat; the old one is revoked until the window ends', async () => {
    const old = await tokenIssuedAgo(TTL + 60);
    const fresh = await tokens.refresh(old, ISSUER);
    const [oldClaims, newClaims] = await Promise.all([
      jwt.verify(old, { allowExpired: true }),
      jwt.verify(fresh?.token ?? ''),
    ]);

    expect(newClaims).toMatchObject({ sub: '7', iat: oldClaims?.iat, iss: ISSUER });
    expect(revokedTokens.revoked.get('jti-1')).toEqual(new Date(((oldClaims?.iat ?? 0) + WINDOW) * 1000));
    expect(await tokens.authenticate(fresh?.token ?? '')).toBe(7);
  });

  test('refresh: each token can be refreshed only once', async () => {
    const old = await tokenIssuedAgo(0);
    expect(await tokens.refresh(old, ISSUER)).toMatchObject({ expiresInSeconds: TTL });
    expect(await tokens.refresh(old, ISSUER)).toBeUndefined();
  });

  test('refresh: refuses tokens past the window and invalid tokens', async () => {
    expect(await tokens.refresh(await tokenIssuedAgo(WINDOW + 60), ISSUER)).toBeUndefined();
    expect(await tokens.refresh('not-a-jwt', ISSUER)).toBeUndefined();
    expect(revokedTokens.revoked.size).toBe(0);
  });
});
