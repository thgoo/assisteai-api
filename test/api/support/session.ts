import { expect } from 'bun:test';
import type { GoogleAccount } from './mock';
import { post, sessionCookie } from './http';
import { googleIdToken } from './mock';
import { userById } from './oracle';

export function signIn(account: GoogleAccount, overrides: Record<string, unknown> = {}) {
  return googleIdToken(account, overrides).then(credential => post('/auth/google', { json: { credential } }));
}

/** Signs in and returns the session cookie's value. */
export async function sessionFor(account: GoogleAccount): Promise<string> {
  const response = await signIn(account);
  expect(response.status).toBe(200);
  const cookie = sessionCookie(response);
  if (!cookie) throw new Error('No session cookie');
  return cookie.value;
}

/** The Google account of a fixture user (users without a Google id get one; the email links them). */
export function googleAccountOf(userId: number): GoogleAccount {
  const user = userById(userId);
  return {
    sub: user.googleSub ?? `9000000000000000000${userId}`,
    email: user.email,
    name: user.name,
    ...(user.avatarUrl === null ? {} : { picture: user.avatarUrl }),
  };
}
