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
 * Verifies Google Identity Services ID tokens (the `credential` the frontend gets on sign-in): RS256 signature with
 * Google's published keys, issuer, audience, expiry and a verified email.
 */
export class GoogleIdTokenVerifier {
  private keys: HonoJsonWebKey[] = [];
  private keysExpireAt = 0;
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

  /** Cached keys, refreshed when they expire or when a token names a key we don't have yet (Google rotates them). */
  private async keysFor(kid: string): Promise<HonoJsonWebKey[]> {
    const known = this.keys.some(key => key.kid === kid);
    if (!known || this.now() >= this.keysExpireAt) await this.refreshKeys();
    return this.keys;
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
