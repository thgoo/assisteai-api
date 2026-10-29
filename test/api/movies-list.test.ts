import { describe, expect, test } from 'bun:test';
import { get } from './support/http';
import { listedMovies, movieSummary, PAGE_SIZE } from './support/oracle';
import { movieListSchema, problemSchema } from './support/schemas';

async function getPage(cursor?: string) {
  const response = await get(cursor === undefined ? '/movies' : `/movies?cursor=${cursor}`);
  expect(response.status).toBe(200);
  return movieListSchema.parse(response.body);
}

describe('GET /movies', () => {
  const listed = listedMovies();

  test('first page: 24 movies, most recently rated first, each with its rating summary', async () => {
    const page = await getPage();

    expect(page.data).toEqual(listed.slice(0, PAGE_SIZE).map(movieSummary));
    expect(page.nextCursor).toBeString();
  });

  test('the next cursor gives the rest, without repeating or skipping movies rated at the same second', async () => {
    const first = await getPage();
    const second = await getPage(first.nextCursor ?? '');

    expect(second.data).toEqual(listed.slice(PAGE_SIZE).map(movieSummary));
    expect(second.nextCursor).toBeNull();
    expect([...first.data, ...second.data].map(m => m.id)).toEqual(listed.map(m => m.id));
  });

  test('average rounds halves up (mean score 2.5 → COOL)', async () => {
    const page = await getPage();
    expect(page.data.find(m => m.id === 2)?.rating.average).toBe('COOL');
  });

  test('movies without ratings are not listed', async () => {
    const first = await getPage();
    const second = await getPage(first.nextCursor ?? '');
    expect([...first.data, ...second.data].map(m => m.id)).not.toContain(31);
  });

  test('an invalid cursor: 422 problem', async () => {
    const response = await get('/movies?cursor=garbage');

    expect(response.status).toBe(422);
    expect(problemSchema.parse(response.body)).toMatchObject({ detail: 'Cursor inválido.' });
  });
});
