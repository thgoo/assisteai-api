import { describe, expect, test } from 'bun:test';
import { get } from './support/http';
import { movieById, movieDetail } from './support/oracle';
import { movieDetailSchema, problemSchema } from './support/schemas';

async function getDetail(id: number) {
  const response = await get(`/movies/${id}`);
  expect(response.status).toBe(200);
  return movieDetailSchema.parse(response.body);
}

describe('GET /movies/{id}', () => {
  test.each([
    [1, 'three ratings, oldest first, each with its author\'s public profile'],
    [3, 'a series'],
    [4, 'no images'],
    [6, 'no year, no genres'],
    [31, 'no ratings: an empty rating block'],
  ])('movie %i: %s', async id => {
    expect(await getDetail(id)).toEqual(movieDetail(movieById(id)));
  });

  test('an unknown id: 404 problem', async () => {
    const response = await get('/movies/999999');

    expect(response.status).toBe(404);
    expect(problemSchema.parse(response.body)).toMatchObject({ status: 404, detail: 'Filme não encontrado.' });
  });

  test('a non-numeric id: 404', async () => {
    expect((await get('/movies/abc')).status).toBe(404);
  });
});
