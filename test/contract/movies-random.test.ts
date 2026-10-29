import { describe, expect, test } from 'bun:test';
import { get } from './support/http';
import { averageLabel, backdropUrl, label, lastLabel, randomEligibleMovies, threadsOf } from './support/oracle';
import { randomMovieResponseSchema } from './support/schemas';

const SAMPLES = 15;

describe('GET /movies/random', () => {
  const eligible = randomEligibleMovies();

  test('returns a movie with a backdrop and at least one COOL-or-better rating', async () => {
    const responses = await Promise.all(Array.from({ length: SAMPLES }, () => get('/movies/random')));

    for (const response of responses) {
      expect(response.status).toBe(200);
      const { data } = randomMovieResponseSchema.parse(response.body);
      const movie = eligible.find(m => m.originalTitle === data.original_title);

      expect(movie).toBeDefined();
      if (!movie) continue;
      expect(data.backdrop_path).toBe(backdropUrl(movie));
      expect(data.rating).toMatchObject({
        count: threadsOf(movie.id).length,
        average: averageLabel(movie.id),
        last: lastLabel(movie.id),
      });
      expect(data.rating.list.map(t => ({ id: t.id, rating: t.rating })))
        .toEqual(threadsOf(movie.id).map(t => ({ id: t.id, rating: label(t.rating) })));
      // Threads come without their user here (the parsed data drops unknown keys, so check the raw body).
      const raw = response.body as { data: { rating: { list: object[] } } };
      expect(raw.data.rating.list.some(t => 'user' in t)).toBe(false);
    }
  });
});
