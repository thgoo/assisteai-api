import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { resetDatabase } from './support/database';
import { get, post } from './support/http';
import { resetMock, stubTitle, stubTmdb, tmdbFixture } from './support/mock';
import { problemSchema, titleSearchSchema } from './support/schemas';
import { googleAccountOf, sessionFor } from './support/session';

const SEARCH = '/3/search/multi';

/** A search/multi result in TMDb's shape. */
function tmdbResult(mediaType: 'movie' | 'tv', id: number, title: string) {
  const [titleKey, originalKey, dateKey] = mediaType === 'movie'
    ? ['title', 'original_title', 'release_date']
    : ['name', 'original_name', 'first_air_date'];
  return {
    media_type: mediaType, id, [titleKey]: title, [originalKey]: title, [dateKey]: '2010-01-01', poster_path: null,
  };
}

const sessions = new Map<number, string>();

async function search(userId: number | null, q?: string) {
  const path = q === undefined ? '/titles/search' : `/titles/search?${new URLSearchParams({ q }).toString()}`;
  if (userId === null) return get(path);
  let session = sessions.get(userId);
  if (session === undefined) {
    session = await sessionFor(googleAccountOf(userId));
    sessions.set(userId, session);
  }
  return get(path, { session });
}

async function expectProblem(response: Promise<{ status: number; body: unknown }>, status: number, detail: string) {
  const { status: actual, body } = await response;
  expect(actual).toBe(status);
  expect(problemSchema.parse(body).detail).toBe(detail);
}

async function results(userId: number, q: string) {
  const response = await search(userId, q);
  expect(response.status).toBe(200);
  return titleSearchSchema.parse(response.body).data;
}

describe('GET /titles/search', () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);
  beforeEach(resetMock);

  test('without a session: 401', async () => {
    await expectProblem(search(null, 'matrix'), 401, 'Faça login para continuar.');
  });

  test.each([
    [undefined, 'Digite pelo menos 2 letras.'],
    ['a', 'Digite pelo menos 2 letras.'],
    ['  a  ', 'Digite pelo menos 2 letras.'],
    ['x'.repeat(101), 'A busca pode ter no máximo 100 caracteres.'],
  ])('q=%p: 422', async (q, detail) => {
    await expectProblem(search(1, q), 422, detail);
  });

  test('movies and series from TMDb, at most 10, in its order, as links POST /ratings accepts', async () => {
    await stubTmdb(SEARCH, await tmdbFixture('search-the-office'), { query: 'the office', language: 'pt-BR' });
    const response = await search(1, '  the office ');

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=60');
    const data = titleSearchSchema.parse(response.body).data;
    expect(data).toHaveLength(10);
    expect(data[0]).toEqual({
      url: 'https://www.themoviedb.org/tv/2316',
      category: 'series',
      title: 'The Office',
      originalTitle: 'The Office',
      year: 2005,
      posterUrl: 'https://image.tmdb.org/t/p/w185/50DVZEgPwGokQf4o0KHZGQMJqDD.jpg',
      ratedByMe: false,
    });
    // The person ranked 8th is left out, so the 10th is TMDb's 11th result.
    expect(data[9]?.url).toBe('https://www.themoviedb.org/movie/1563251');
    expect(data[9]?.category).toBe('movie');
  });

  test('ratedByMe: titles the signed-in user rated, matched by TMDb id and category', async () => {
    // Fixture movie n has TMDb id 10000 + n. Everyone rated movie 1; movie 3 is a series rated by user 2 only.
    await stubTmdb(SEARCH, {
      results: [
        tmdbResult('movie', 10_001, 'The Matrix'),
        tmdbResult('tv', 10_003, 'Snowpiercer'),
        tmdbResult('movie', 10_003, 'A movie sharing the series\' TMDb id'),
        tmdbResult('movie', 10_031, 'Never Rated'),
        tmdbResult('movie', 99_999, 'Not in the database'),
      ],
    }, { query: 'mixed' });

    expect((await results(1, 'mixed')).map(result => result.ratedByMe)).toEqual([true, false, false, false, false]);
    expect((await results(2, 'mixed')).map(result => result.ratedByMe)).toEqual([true, true, false, false, false]);
  });

  test('ratedByMe: a title first rated through its IMDb link', async () => {
    await stubTmdb('/3/find/tt0137523', await tmdbFixture('find-tt0137523'));
    await stubTitle('/3/movie/550', 'movie-550');
    const session = await sessionFor(googleAccountOf(3));
    const json = { url: 'https://www.imdb.com/title/tt0137523/', rating: 'GOOD' };
    const rated = await post('/ratings', { json, session });
    expect(rated.status).toBe(201);

    await stubTmdb(SEARCH, { results: [tmdbResult('movie', 550, 'Fight Club')] }, { query: 'fight club' });
    expect((await results(3, 'fight club'))[0]?.ratedByMe).toBe(true);
  });

  test('no results: an empty list', async () => {
    await stubTmdb(SEARCH, { page: 1, results: [], total_pages: 1, total_results: 0 }, { query: 'zzzz' });
    expect(await results(1, 'zzzz')).toEqual([]);
  });

  test('TMDb failing: 502', async () => {
    await stubTmdb(SEARCH, { status_code: 25, status_message: 'Request limit exceeded' }, { query: 'matrix' }, 503);
    await expectProblem(search(1, 'matrix'), 502, 'Não foi possível buscar agora. Tente de novo.');
  });
});
