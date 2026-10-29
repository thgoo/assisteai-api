// Mints and reads tokens in the legacy format (tymon/jwt-auth 2, doc 01 §2), independently of either implementation.
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { jwtSecret } from './target';

/** sha1("App\Models\User"): jwt-auth's `prv` claim, checked against the user model. */
export const LEGACY_PRV = '23bd5c8949f600adb39e701c400872db7a5976f7';
export const TOKEN_TTL_SECONDS = 2 * 60 * 60;
export const REFRESH_WINDOW_SECONDS = 14 * 24 * 60 * 60;

export const claimsSchema = z.object({
  iss: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
  nbf: z.number().int(),
  jti: z.string(),
  sub: z.string(),
  prv: z.string(),
});
export type Claims = z.infer<typeof claimsSchema>;

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function mintToken(userId: number, overrides: Partial<Claims> = {}, secret = jwtSecret): string {
  const iat = overrides.iat ?? nowInSeconds();
  const claims: Claims = {
    iss: 'http://contract-tests/auth/login/google',
    iat,
    exp: iat + TOKEN_TTL_SECONDS,
    nbf: iat,
    jti: randomUUID().replaceAll('-', '').slice(0, 16),
    sub: String(userId),
    prv: LEGACY_PRV,
    ...overrides,
  };
  const unsigned = `${base64url(JSON.stringify({ typ: 'JWT', alg: 'HS256' }))}.${base64url(JSON.stringify(claims))}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function decodeClaims(token: string): Claims {
  const [, payload] = token.split('.');
  return claimsSchema.parse(JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')));
}
