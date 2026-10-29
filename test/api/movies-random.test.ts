import { describe, expect, test } from 'bun:test';
import { get } from './support/http';
import { movieDetail, randomEligibleMovies } from './support/oracle';
import { movieDetailSchema } from './support/schemas';

const SAMPLES = 15;

describe('GET /movies/random', () => {
  const eligible = randomEligibleMovies();

  test('a movie with a backdrop and at least one COOL-or-better rating, as a full detail', async () => {
    const responses = await Promise.all(Array.from({ length: SAMPLES }, () => get('/movies/random')));

    for (const response of responses) {
      expect(response.status).toBe(200);
      const movie = movieDetailSchema.parse(response.body);
      const fixture = eligible.find(m => m.id === movie.id);

      expect(fixture).toBeDefined();
      if (fixture) expect(movie).toEqual(movieDetail(fixture));
    }
  });
});
