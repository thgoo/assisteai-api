import type { HonoJsonWebKey } from 'hono/utils/jwt/jws';
import { decodeHeader, verifyWithJwks } from 'hono/utils/jwt/jwt';
import { z } from 'zod';

const identitySchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.literal(true),
  name: z.string().min(1),
  picture: z.url().optional(),
});

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface GoogleIdTokenVerifierOptions {
  /** The OAuth client id the frontend signs in with: ID tokens must be issued for it (`aud`). */
  clientId: string;
  /** Google's signing keys: `https://www.googleapis.com/oauth2/v3/certs`, or the mock in tests. */
  jwksUrl: string;
  timeoutMs: number;
  /** Injectable for tests. */
  fetch?: (request: Request) => Promise<Response>;
  now?: () => number;
}

/** Used when Google's response has no usable `Cache-Control: max-age`. */
const DEFAULT_KEYS_TTL_MS = 60 * 60 * 1000;

/**
 * After a failed key fetch, nothing that needs a fetch calls Google for this long (it throws instead); after a
 * fetch for an unknown `kid` that worked but lacked it, unknown `kid`s skip refetching for this long.
 */
const UNKNOWN_KID_REFETCH_COOLDOWN_MS = 10_000;

/**
 * Verifies Google Identity Services ID tokens (the `credential` the frontend gets on sign-in): RS256 signature with
 * Google's published keys, issuer, audience, expiry and a verified email.
 */
export class GoogleIdTokenVerifier {
  private keys: HonoJsonWebKey[] = [];
  private keysExpireAt = 0;
  /** Last failed fetch, on any path; cleared by any successful fetch. */
  private lastFetchFailedAt = Number.NEGATIVE_INFINITY;
  /** Last successful fetch for an unknown `kid` on a fresh cache that still lacked it. */
  private lastUnknownKidMissAt = Number.NEGATIVE_INFINITY;
  private inFlightRefresh: Promise<void> | undefined;
  private readonly fetch: (request: Request) => Promise<Response>;
  private readonly now: () => number;

  constructor(private readonly options: GoogleIdTokenVerifierOptions) {
    this.fetch = options.fetch ?? (request => fetch(request));
    this.now = options.now ?? Date.now;
  }

  /** The signed-in Google identity, or `undefined` when the token isn't a valid ID token for this app. */
  async verify(idToken: string): Promise<GoogleIdentity | undefined> {
    let kid: string | undefined;
    try {
      kid = decodeHeader(idToken).kid;
    } catch {
      return undefined;
    }
    if (kid === undefined) return undefined;

    const keys = await this.keysFor(kid);
    try {
      const payload = await verifyWithJwks(idToken, {
        keys,
        allowedAlgorithms: ['RS256'],
        verification: { iss: /^(https:\/\/)?accounts\.google\.com$/, aud: this.options.clientId },
      });
      const identity = identitySchema.safeParse(payload);
      if (!identity.success) return undefined;

      const { sub, email, name, picture } = identity.data;
      return { sub, email, name, avatarUrl: picture ?? null };
    } catch {
      return undefined;
    }
  }

  /**
   * Cached keys, refreshed when they expire or when a token names a key we don't have yet (Google rotates them).
   * A known `kid` on fresh keys never waits on a cooldown. Otherwise, within the failure cooldown this throws without
   * calling Google, and within the miss cooldown an unknown `kid` gets the cached keys (an invalid token).
   */
  private async keysFor(kid: string): Promise<HonoJsonWebKey[]> {
    const fresh = this.now() < this.keysExpireAt;
    if (fresh && this.hasKey(kid)) return this.keys;
    if (this.inCooldown(this.lastFetchFailedAt)) {
      throw new Error('Google JWKS fetch failed recently; not refetching yet');
    }
    if (fresh && this.inCooldown(this.lastUnknownKidMissAt)) return this.keys;

    await this.refreshKeysOnce();
    if (fresh && !this.hasKey(kid)) this.lastUnknownKidMissAt = this.now();
    return this.keys;
  }

  private inCooldown(since: number): boolean {
    return this.now() - since < UNKNOWN_KID_REFETCH_COOLDOWN_MS;
  }

  private hasKey(kid: string): boolean {
    return this.keys.some(key => key.kid === kid);
  }

  /** Concurrent callers share the refetch in progress. */
  private refreshKeysOnce(): Promise<void> {
    this.inFlightRefresh ??= this.refreshKeysTrackingFailure().finally(() => {
      this.inFlightRefresh = undefined;
    });
    return this.inFlightRefresh;
  }

  private async refreshKeysTrackingFailure(): Promise<void> {
    try {
      await this.refreshKeys();
    } catch (error) {
      this.lastFetchFailedAt = this.now();
      throw error;
    }
    this.lastFetchFailedAt = Number.NEGATIVE_INFINITY;
  }

  private async refreshKeys(): Promise<void> {
    const response = await this.fetch(new Request(this.options.jwksUrl, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    }));
    if (!response.ok) throw new Error(`Google JWKS fetch failed with ${response.status}`);

    const { keys } = z.object({ keys: z.array(z.looseObject({ kid: z.string() })) }).parse(await response.json());
    const maxAge = /max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1];
    this.keys = keys;
    this.keysExpireAt = this.now() + (maxAge === undefined ? DEFAULT_KEYS_TTL_MS : Number(maxAge) * 1000);
  }
}
