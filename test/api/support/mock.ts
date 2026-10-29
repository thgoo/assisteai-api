// Client for the external API mock's control port (test/mock/server.ts).
import { z } from 'zod';
import { mockUrl } from './env';

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

/** Makes TMDb answer `body` for this path (and these query parameters, if given). */
export async function stubTmdb(path: string, body: unknown, query: Record<string, string> = {}): Promise<void> {
  await control('POST', '/__tmdb', { path, query, body });
}

export async function telegramMessages(): Promise<TelegramMessage[]> {
  const recorded = recordedSchema.parse(await control('GET', '/__requests'));
  return recorded
    .filter(r => r.host === 'api.telegram.org' && r.path.endsWith('/sendMessage'))
    .map(r => telegramMessageSchema.parse(r.body));
}
