import { describe, expect, test } from 'bun:test';
import type { TmdbReference } from './tmdb-client';
import { TmdbClient } from './tmdb-client';

// Real TMDb responses, recorded on 2026-10-29.
const FIXTURES: Record<string, string> = {
  '/3/movie/550?language=pt-BR': 'movie-550.pt-BR',
  '/3/movie/550?language=en-US': 'movie-550.en-US',
  '/3/tv/1399?language=pt-BR': 'tv-1399.pt-BR',
  '/3/tv/1399?language=en-US': 'tv-1399.en-US',
  '/3/find/tt0137523': 'find-tt0137523',
  '/3/find/tt0944947': 'find-tt0944947',
  '/3/find/tt0000000': 'find-tt0000000',
};

/** A client whose HTTP calls are answered from the fixtures (or with `status`), recording each request. */
function clientWithFixtures(status?: number, baseUrl = 'https://tmdb.test') {
  const requests: Request[] = [];
  const client = new TmdbClient({
    baseUrl,
    accessToken: 'token',
    timeoutMs: 1000,
    fetch: async request => {
      requests.push(request);
      if (status !== undefined) return new Response('{}', { status });

      const url = new URL(request.url);
      const language = url.searchParams.get('language');
      const fixture = FIXTURES[`${url.pathname}${language ? `?language=${language}` : ''}`] ?? 'movie-not-found';
      const body = await Bun.file(new URL(`../../../test/fixtures/tmdb/${fixture}.json`, import.meta.url)).text();
      return new Response(body, { status: fixture === 'movie-not-found' ? 404 : 200 });
    },
  });
  return { client, requests };
}

describe('TmdbClient', () => {
  test('a movie: pt-BR title and overview, en-US genres and images, both external ids', async () => {
    const { client } = clientWithFixtures();

    expect(await client.fetchTitle({ category: 'movie', tmdbId: '550' })).toEqual({
      category: 'movie',
      tmdbId: '550',
      imdbId: 'tt0137523',
      title: 'Clube da Luta',
      originalTitle: 'Fight Club',
      year: 1999,
      genres: ['Drama', 'Thriller'],
      description: expect.stringMatching(/^Um homem deprimido que sofre de insônia/) as string,
      originalDescription: expect.stringMatching(/^A ticking-time-bomb insomniac/) as string,
      posterPath: '/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg',
      backdropPath: expect.stringMatching(/^\/\w+\.jpg$/) as string,
    });
  });

  test('a TV show: name, first air date and its IMDb id', async () => {
    const { client } = clientWithFixtures();

    expect(await client.fetchTitle({ category: 'tv', tmdbId: '1399' })).toMatchObject({
      category: 'tv',
      imdbId: 'tt0944947',
      title: 'Game of Thrones',
      originalTitle: 'Game of Thrones',
      year: 2011,
      genres: ['Sci-Fi & Fantasy', 'Drama', 'Action & Adventure'],
    });
  });

  test('sends the token as a Bearer header (never in the URL) and asks for the external ids', async () => {
    const { client, requests } = clientWithFixtures();
    await client.fetchTitle({ category: 'movie', tmdbId: '550' });

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.headers.get('Authorization')).toBe('Bearer token');
      expect(request.url).not.toContain('api_key');
      expect(new URL(request.url).searchParams.get('append_to_response')).toBe('external_ids');
    }
  });

  test('keeps a path prefix in the base URL (e.g. a proxy or the test mock)', async () => {
    const { client, requests } = clientWithFixtures(undefined, 'http://mock.test/api.themoviedb.org/');
    await client.findByImdbId('tt0137523');

    expect(new URL(requests[0]?.url ?? '').pathname).toBe('/api.themoviedb.org/3/find/tt0137523');
  });

  test('an unknown title is undefined', async () => {
    const { client } = clientWithFixtures();
    expect(await client.fetchTitle({ category: 'movie', tmdbId: '999999999' })).toBeUndefined();
  });

  test.each<[string, TmdbReference | undefined]>([
    ['tt0137523', { category: 'movie', tmdbId: '550' }],
    ['tt0944947', { category: 'tv', tmdbId: '1399' }],
    ['tt0000000', undefined],
  ])('findByImdbId(%s): movies first, then TV, else undefined', async (imdbId, expected) => {
    const { client } = clientWithFixtures();
    expect(await client.findByImdbId(imdbId)).toEqual(expected);
  });

  test('other failures throw, so a TMDb outage never looks like "not found"', async () => {
    const { client } = clientWithFixtures(401);
    const error = await client.fetchTitle({ category: 'movie', tmdbId: '550' }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain('401');
  });
});
