// Tokens issued by one implementation must work on the other: no forced logout at cutover, and a rollback stays
// possible. Runs with TARGET=new when LEGACY_BASE_URL points at the legacy env (both apps share JWT_SECRET).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { resetDatabase, resetLegacyDatabase } from './support/database';
import { get, post } from './support/http';
import { registerGoogleToken, resetMock } from './support/mock';
import { userById } from './support/oracle';
import { loginResponseSchema, meResponseSchema, tokenResponseSchema } from './support/schemas';
import { legacyBaseUrl, target } from './support/target';

const ana = userById(1);
const anaAtGoogle = { sub: ana.providerId, name: ana.name, email: ana.email, picture: ana.avatar ?? '' };

async function loginOn(baseUrl: string | undefined, googleToken: string) {
  await registerGoogleToken(googleToken, anaAtGoogle);
  const response = await post('/auth/login/google', { json: { token: googleToken }, baseUrl });
  expect(response.status).toBe(200);
  return loginResponseSchema.parse(response.body).access_token;
}

async function expectMe(baseUrl: string | undefined, token: string) {
  const response = await get('/auth/me', { token, baseUrl });
  expect(response.status).toBe(200);
  expect(meResponseSchema.parse(response.body).user.email).toBe(ana.email);
}

describe.if(target === 'new' && legacyBaseUrl !== undefined)('tokens across implementations', () => {
  beforeAll(() => Promise.all([resetDatabase(), resetLegacyDatabase()]));
  afterAll(() => Promise.all([resetDatabase(), resetLegacyDatabase()]));
  beforeEach(resetMock);

  test('a token issued by the new app works on legacy, and so does its refresh', async () => {
    const token = await loginOn(undefined, 'google-token-cross-new');
    await expectMe(legacyBaseUrl, token);

    const refreshed = await post('/auth/refresh', { token });
    await expectMe(legacyBaseUrl, tokenResponseSchema.parse(refreshed.body).access_token);
  });

  test('a token issued by legacy works on the new app, and the new app refreshes it', async () => {
    const token = await loginOn(legacyBaseUrl, 'google-token-cross-legacy');
    await expectMe(undefined, token);

    const refreshed = await post('/auth/refresh', { token });
    expect(refreshed.status).toBe(200);
    await expectMe(undefined, tokenResponseSchema.parse(refreshed.body).access_token);
  });
});
