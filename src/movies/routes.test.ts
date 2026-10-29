import { describe, expect, test } from 'bun:test';
import type { MovieService } from './movie-service';
import { createApp } from '~/app';
import { ConsoleLogger } from '~/logger';

function appWith(movieService: Partial<MovieService>) {
  return createApp({
    logger: new ConsoleLogger({ level: 'error', format: 'json' }),
    corsOrigins: ['https://assisteai.com.br'],
    movieService: movieService as MovieService,
  });
}

describe('movie routes', () => {
  test('GET /movies/random without an eligible movie: 404 problem', async () => {
    const app = appWith({ findRandomRecommended: () => Promise.resolve(undefined) });
    const response = await app.request('/movies/random');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: 404, detail: 'Nenhum filme para sugerir ainda.' });
  });

  test('GET /movies/{id} looks the id up as a number', async () => {
    const asked: number[] = [];
    const app = appWith({
      findDetail: id => {
        asked.push(id);
        return Promise.resolve(undefined);
      },
    });

    expect((await app.request('/movies/42')).status).toBe(404);
    expect(asked).toEqual([42]);
  });

  test('GET /movies/{id} with more than 15 digits never reaches the database', async () => {
    const response = await appWith({}).request('/movies/1234567890123456');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ type: 'about:blank', title: 'Not Found', status: 404 });
  });

  test('GET /movies with an invalid cursor: 422', async () => {
    const response = await appWith({}).request('/movies?cursor=garbage');

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ detail: 'Cursor inválido.', errors: [{ path: 'cursor' }] });
  });
});
