// Client for the external API mock's control port (test/mock/server.ts).
import { z } from 'zod';
import { googleClientId, mockUrl } from './env';

const recordedSchema = z.array(z.object({
  method: z.string(),
  host: z.string(),
  path: z.string(),
  query: z.record(z.string(), z.string()),
  body: z.unknown(),
}));

const telegramMessageSchema = z.object({
  chat_id: z.coerce.string(),
  text: z.string(),
  parse_mode: z.string(),
});
export type TelegramMessage = z.infer<typeof telegramMessageSchema>;

async function control(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(new URL(path, mockUrl), {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Mock ${method} ${path} failed with ${response.status}`);
  return response.json();
}

export async function resetMock(): Promise<void> {
  await control('POST', '/__reset');
}

export interface GoogleAccount {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

/** A Google ID token for this account, signed with the keys the mock publishes as Google's. */
export async function googleIdToken(account: GoogleAccount, overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com', aud: googleClientId, email_verified: true, iat: now, exp: now + 3600,
    ...account, ...overrides,
  };
  const { idToken } = z.object({ idToken: z.string() }).parse(await control('POST', '/__google/id-token', { claims }));
  return idToken;
}

/** Makes TMDb answer `body` for this path (and these query parameters, if given). */
export async function stubTmdb(
  path: string,
  body: unknown,
  query: Record<string, string> = {},
  status = 200,
): Promise<void> {
  await control('POST', '/__tmdb', { path, query, status, body });
}

/** A real TMDb response (recorded 2026-10-29). */
export async function tmdbFixture(name: string): Promise<unknown> {
  return Bun.file(new URL(`../../fixtures/tmdb/${name}.json`, import.meta.url)).json() as Promise<unknown>;
}

/** Stubs both languages of a movie or TV show from its recorded responses. */
export async function stubTitle(path: string, fixture: string, overrides: Record<string, unknown> = {}): Promise<void> {
  for (const language of ['pt-BR', 'en-US']) {
    const body = { ...(await tmdbFixture(`${fixture}.${language}`) as object), ...overrides };
    await stubTmdb(path, body, { language });
  }
}

export async function telegramMessages(): Promise<TelegramMessage[]> {
  const recorded = recordedSchema.parse(await control('GET', '/__requests'));
  return recorded
    .filter(r => r.host === 'api.telegram.org' && r.path.endsWith('/sendMessage'))
    .map(r => telegramMessageSchema.parse(r.body));
}
