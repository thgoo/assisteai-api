// Tokens in the format of the legacy tymon/jwt-auth 2 setup (doc 01 §2), so both apps accept each other's tokens
// (no forced logout at cutover, and a rollback stays possible).
import { sign, verify } from 'hono/jwt';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

/** sha1("App\Models\User"): jwt-auth's model claim. Tokens for other models are rejected, like legacy. */
export const LEGACY_PRV = '23bd5c8949f600adb39e701c400872db7a5976f7';

const claimsSchema = z.object({
  iss: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
  nbf: z.number().int(),
  jti: z.string().min(1),
  sub: z.string().regex(/^[1-9]\d{0,15}$/),
  prv: z.literal(LEGACY_PRV),
});

export type Claims = z.infer<typeof claimsSchema>;

export interface LegacyJwtOptions {
  secret: string;
  ttlSeconds: number;
}

const JTI_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class LegacyJwt {
  constructor(private readonly options: LegacyJwtOptions) {}

  /**
   * Signs a token for `sub`. `iss` is the URL of the issuing request (legacy uses the full request URL).
   * `iat` is kept across refreshes, so the refresh window counts from the first login.
   */
  async sign({ sub, iss, iat }: { sub: number; iss: string; iat?: number }): Promise<string> {
    const now = nowInSeconds();
    const claims: Claims = {
      iss,
      iat: iat ?? now,
      exp: now + this.options.ttlSeconds,
      nbf: now,
      jti: randomJti(),
      sub: String(sub),
      prv: LEGACY_PRV,
    };
    return sign(claims, this.options.secret, 'HS256');
  }

  /** The claims of a well-formed token with a valid signature, or `undefined`. Refresh accepts expired tokens. */
  async verify(token: string, { allowExpired = false } = {}): Promise<Claims | undefined> {
    try {
      const payload = await verify(token, this.options.secret, { alg: 'HS256', exp: !allowExpired });
      const parsed = claimsSchema.safeParse(payload);
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }
}

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Same shape as jwt-auth's `Str::random(16)`. */
function randomJti(): string {
  return Array.from({ length: 16 }, () => JTI_ALPHABET[randomInt(JTI_ALPHABET.length)]).join('');
}
