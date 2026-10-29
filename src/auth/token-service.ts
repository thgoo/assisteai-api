import type { LegacyJwt } from './legacy-jwt';
import type { RevokedTokens } from './revoked-token-repository';
import { nowInSeconds } from './legacy-jwt';

export interface TokenServiceOptions {
  /** How long after the first login (`iat`) a token can still be refreshed. Legacy: 14 days. */
  refreshWindowSeconds: number;
}

export class TokenService {
  constructor(
    private readonly jwt: LegacyJwt,
    private readonly revokedTokens: RevokedTokens,
    private readonly options: TokenServiceOptions,
  ) {}

  issue(userId: number, issuer: string): Promise<string> {
    return this.jwt.sign({ sub: userId, iss: issuer });
  }

  /** The user id of a valid, unexpired, unrevoked token, or `undefined`. */
  async authenticate(token: string): Promise<number | undefined> {
    const claims = await this.jwt.verify(token);
    if (!claims || await this.revokedTokens.isRevoked(claims.jti)) return undefined;
    return Number(claims.sub);
  }

  /**
   * Swaps a token (expired or not) for a new one while inside the refresh window, keeping the original `iat`.
   * The old token is revoked, so each token can be refreshed once. `undefined` when the token can't be refreshed.
   */
  async refresh(token: string, issuer: string): Promise<string | undefined> {
    const claims = await this.jwt.verify(token, { allowExpired: true });
    if (!claims) return undefined;

    const windowEnd = claims.iat + this.options.refreshWindowSeconds;
    if (windowEnd <= nowInSeconds()) return undefined;
    if (!await this.revokedTokens.revoke(claims.jti, new Date(windowEnd * 1000))) return undefined;

    return this.jwt.sign({ sub: Number(claims.sub), iss: issuer, iat: claims.iat });
  }
}
