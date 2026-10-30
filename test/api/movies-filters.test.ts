import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ListFilters, ListSort } from './support/oracle';
import { resetDatabase } from './support/database';
import { get } from './support/http';
import { filteredMovies, genreCounts, movieSummary, PAGE_SIZE, raters } from './support/oracle';
import { genreListSchema, movieListSchema, problemSchema, raterListSchema } from './support/schemas';
import { googleAccountOf, sessionFor } from './support/session';

type Params = Record<string, string>;

function listPath(params: Params): string {
  const query = new URLSearchParams(params).toString();
  return query === '' ? '/movies' : `/movies?${query}`;
}

/** Every page of the list, checking each holds 24 movies until the last. */
async function allPages(params: Params, session?: string) {
  const movies = [];
  let cursor: string | null | undefined;
  do {
    const response = await get(listPath(cursor ? { ...params, cursor } : params), { session });
    expect(response.status).toBe(200);
    const page = movieListSchema.parse(response.body);
    if (page.nextCursor !== null) expect(page.data).toHaveLength(PAGE_SIZE);
    movies.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return movies;
}

function expected(filters: ListFilters, sort?: ListSort) {
  return filteredMovies(filters, sort).map(movieSummary);
}

async function expectProblem(path: string, status: number, detail: string, session?: string) {
  const { status: actual, body } = await get(path, { session });
  expect(actual).toBe(status);
  expect(problemSchema.parse(body).detail).toBe(detail);
}

describe('GET /movies filters and sorts', () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);

  describe('q: title or original title, ignoring case and accents', () => {
    test.each([
      ['acao', [7, 2]],
      ['AÇÃO', [7, 2]],
      ['double', [2]],
      ['matrix', [1]],
      ['%', [8]],
      ['_', [9]],
      ['nothing like this', []],
    ])('q=%p', async (q, ids) => {
      const movies = await allPages({ q });
      expect(movies.map(movie => movie.id).sort()).toEqual([...ids].sort());
      expect(movies).toEqual(expected({ q }));
    });

    test('blank: no filter', async () => {
      expect(await allPages({ q: '   ' })).toEqual(expected({}));
    });
  });

  test.each<[Params, ListFilters]>([
    [{ category: 'series' }, { category: 'series' }],
    [{ category: 'movie' }, { category: 'movie' }],
    [{ genre: 'Action' }, { genre: 'Action' }],
    [{ genre: 'Sci-Fi & Fantasy' }, { genre: 'Sci-Fi & Fantasy' }],
    [{ genre: 'action' }, { genre: 'action' }],
    [{ ratedBy: '3' }, { ratedBy: 3 }],
    [{ ratedBy: '999' }, { ratedBy: 999 }],
  ])('%p', async (params, filters) => {
    expect(await allPages(params)).toEqual(expected(filters));
  });

  test('minRating: average at that key or better (a mean half a point below rounds up into it)', async () => {
    // Movie 2's mean score is 2.5: its average is COOL.
    expect((await allPages({ minRating: 'COOL' })).map(movie => movie.id)).toContain(2);
    expect((await allPages({ minRating: 'GOOD' })).map(movie => movie.id)).not.toContain(2);
    for (const minRating of ['STAY_AWAY', 'COOL', 'VERY_GOOD', 'UNMISSABLE'] as const) {
      expect(await allPages({ minRating })).toEqual(expected({ minRating }));
    }
  });

  test('filters combine with AND, and the rating summary stays global', async () => {
    const params = { category: 'movie', genre: 'Action', minRating: 'GOOD', ratedBy: '2' };
    const movies = await allPages(params);

    expect(movies).toEqual(expected({ category: 'movie', genre: 'Action', minRating: 'GOOD', ratedBy: 2 }));
    expect(movies.map(movie => movie.id)).toEqual([1]);
    expect(movies[0]?.rating.count).toBe(3);
  });

  describe('unratedByMe', () => {
    test('without a session: 401', async () => {
      await expectProblem('/movies?unratedByMe=true', 401, 'Faça login para continuar.');
    });

    test('leaves out what the signed-in user rated', async () => {
      const session = await sessionFor(googleAccountOf(1));
      const movies = await allPages({ unratedByMe: 'true', sort: 'popular' }, session);

      expect(movies).toEqual(expected({ unratedBy: 1 }, 'popular'));
      expect(movies.map(movie => movie.id)).not.toContain(1);
    });
  });

  describe('sorts, paginated across ties', () => {
    test.each<ListSort>(['recent', 'rating', 'popular'])('%s', async sort => {
      expect(await allPages({ sort })).toEqual(expected({}, sort));
    });

    test('recent is the default', async () => {
      expect(await allPages({})).toEqual(expected({}, 'recent'));
    });

    test('a cursor from another sort: 422', async () => {
      const first = movieListSchema.parse((await get('/movies?sort=rating')).body);
      await expectProblem(`/movies?sort=popular&cursor=${first.nextCursor ?? ''}`, 422, 'Cursor inválido.');
      await expectProblem(`/movies?cursor=${first.nextCursor ?? ''}`, 422, 'Cursor inválido.');
    });
  });

  test.each([
    'category=film', 'minRating=AMAZING', 'sort=best', `q=${'x'.repeat(101)}`, 'ratedBy=abc', 'ratedBy=0',
    'ratedBy=1234567890123456', 'unratedByMe=yes', 'genre=',
  ])('invalid %s: 422 with the parameter in errors', async query => {
    const response = await get(`/movies?${query}`);

    expect(response.status).toBe(422);
    const problem = problemSchema.parse(response.body);
    expect(problem.detail).toBe('Filtro inválido.');
    expect(problem.errors?.map(error => error.path)).toEqual([query.split('=')[0] ?? '']);
  });
});

describe('GET /genres', () => {
  test('genres of rated movies with their counts, by name', async () => {
    const response = await get('/genres');

    expect(response.status).toBe(200);
    expect(genreListSchema.parse(response.body).data).toEqual(genreCounts());
  });
});

describe('GET /users', () => {
  beforeAll(resetDatabase);

  test('users with ratings: public profile and rating count, by name, no email', async () => {
    const response = await get('/users');

    expect(response.status).toBe(200);
    expect(raterListSchema.parse(response.body).data).toEqual(raters());
  });
});
