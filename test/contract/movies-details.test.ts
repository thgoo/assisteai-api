import { describe, expect, test } from 'bun:test';
import { get } from './support/http';
import {
  averageLabel, backdropUrl, label, lastLabel, movieById, posterUrl, threadsOf, userById,
} from './support/oracle';
import { errorResponseSchema, movieDetailsResponseSchema } from './support/schemas';
import { byTarget, target } from './support/target';

async function getDetails(id: number) {
  const response = await get(`/movies/${id}`);
  expect(response.status).toBe(200);
  return { raw: response.body, data: movieDetailsResponseSchema.parse(response.body).data };
}

describe('GET /movies/{id}', () => {
  test('returns the fields the movie page reads', async () => {
    const movie = movieById(1);
    const { data } = await getDetails(movie.id);

    expect(data).toMatchObject({
      backdrop_path: backdropUrl(movie),
      poster_path: posterUrl(movie),
      original_title: movie.originalTitle,
      title: movie.title,
      description: movie.description,
      genre: movie.genre,
      year: movie.year,
    });
    expect(data.rating).toMatchObject({
      count: threadsOf(movie.id).length,
      average: averageLabel(movie.id),
      last: lastLabel(movie.id),
    });
  });

  test('lists the ratings in id order, each with its label and the user name and avatar', async () => {
    const { data } = await getDetails(1);

    expect(data.rating.list.map(t => ({ id: t.id, rating: t.rating, name: t.user.name, avatar: t.user.avatar })))
      .toEqual(threadsOf(1).map(t => ({
        id: t.id,
        rating: label(t.rating),
        name: userById(t.userId).name,
        avatar: userById(t.userId).avatar,
      })));
  });

  test('average rounds half away from zero (mean 2.5 → Legal), like PHP round()', async () => {
    const { data } = await getDetails(2);
    expect(data.rating.average).toBe('Legal');
  });

  test('missing images and year are null', async () => {
    const [noImages, noYear] = await Promise.all([getDetails(4), getDetails(6)]);

    expect(noImages.data.backdrop_path).toBeNull();
    expect(noImages.data.poster_path).toBeNull();
    expect(noYear.data.year).toBeNull();
  });

  test('rating users don\'t expose their email on the new app (Q-14)', async () => {
    const { raw } = await getDetails(1);
    const [firstThread] = (raw as { data: { rating: { list: { user: Record<string, unknown> }[] } } }).data.rating.list;

    expect('email' in (firstThread?.user ?? {})).toBe(byTarget({ legacy: true, new: false }));
  });

  test('a movie without ratings: 500 on legacy (Q-17), empty rating block on the new app', async () => {
    const response = await get('/movies/31');

    if (target === 'legacy') {
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, status: 500, message: 'HTTP_INTERNAL_SERVER_ERROR' });
      return;
    }
    expect(response.status).toBe(200);
    const { data } = movieDetailsResponseSchema.parse(response.body);
    expect(data.rating).toEqual({ count: 0, average: null, last: null, list: [] });
  });

  test('an unknown id is an error: 200 on legacy, 404 on the new app (Q-03)', async () => {
    const response = await get('/movies/999999');

    expect(response.status).toBe(byTarget({ legacy: 200, new: 404 }));
    expect(errorResponseSchema.parse(response.body)).toEqual({ success: false, message: 'Erro catastrófico.' });
  });
});
