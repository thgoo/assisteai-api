import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { TelegramMessage } from './support/mock';
import { resetDatabase } from './support/database';
import { get, post } from './support/http';
import { resetMock, stubTitle, stubTmdb, telegramMessages, tmdbFixture } from './support/mock';
import { listedMovies, movieById, ratingsOf, userById } from './support/oracle';
import { movieDetailSchema, movieListSchema, problemSchema } from './support/schemas';
import { googleAccountOf, sessionFor } from './support/session';

const FRONTEND_URL = 'https://assisteai.com.br';

const sessions = new Map<number, string>();

async function rate(userId: number | null, body: Record<string, unknown>) {
  if (userId === null) return post('/ratings', { json: body });
  let session = sessions.get(userId);
  if (session === undefined) {
    session = await sessionFor(googleAccountOf(userId));
    sessions.set(userId, session);
  }
  return post('/ratings', { json: body, session });
}

async function expectProblem(response: Promise<{ status: number; body: unknown }>, status: number, detail: string) {
  const { status: actual, body } = await response;
  expect(actual).toBe(status);
  expect(problemSchema.parse(body).detail).toBe(detail);
}

async function created(response: Promise<{ status: number; body: unknown }>) {
  const { status, body } = await response;
  expect(status).toBe(201);
  return (body as { movie: { id: number; slug: string } }).movie;
}

async function detail(id: number) {
  return movieDetailSchema.parse((await get(`/movies/${id}`)).body);
}

/** Telegram is notified in the background, so wait for it. */
async function nextTelegramMessage(): Promise<TelegramMessage> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [message] = await telegramMessages();
    if (message) return message;
    await Bun.sleep(50);
  }
  throw new Error('No Telegram message');
}

describe('POST /ratings', () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);
  beforeEach(resetMock);

  test('without a session: 401', async () => {
    await expectProblem(rate(null, { url: 'https://www.imdb.com/title/tt1000004/', rating: 'GOOD' }),
      401, 'Faça login para continuar.');
  });

  describe('validation: 422 with a message for the user', () => {
    test.each([
      [{ rating: 'GOOD' }, 'Informe o título.'],
      [{ url: 'https://www.imdb.com/title/tt1000004/', movieId: 4, rating: 'GOOD' }, 'Informe o título.'],
      [{ movieId: '4', rating: 'GOOD' }, 'Informe o título.'],
      [{ movieId: 4.5, rating: 'GOOD' }, 'Informe o título.'],
      [{ movieId: 0, rating: 'GOOD' }, 'Informe o título.'],
      [{ movieId: 2 ** 31, rating: 'GOOD' }, 'Informe o título.'],
      [{ movieId: 4 }, 'Escolha uma avaliação.'],
      [{ url: '   ', rating: 'GOOD' }, 'Informe o link do IMDb ou do TMDb.'],
      [{ url: 'https://www.imdb.com/title/tt1000004/' }, 'Escolha uma avaliação.'],
      [{ url: 'https://www.imdb.com/title/tt1000004/', rating: 'AMAZING' }, 'Escolha uma avaliação.'],
      [{ url: 'https://www.imdb.com/title/tt1000004/', rating: 'GOOD', comment: 'x'.repeat(2001) },
        'O comentário pode ter no máximo 2000 caracteres.'],
      [{ url: 'https://example.com/movie/1', rating: 'GOOD' }, 'Link do IMDb ou do TMDb inválido.'],
      [{ url: 'https://www.imdb.com/name/nm0000206/', rating: 'GOOD' }, 'Link do IMDb ou do TMDb inválido.'],
    ])('%j', async (body, message) => {
      await expectProblem(rate(1, body), 422, message);
    });

    test('a title TMDb doesn\'t know', async () => {
      await expectProblem(rate(1, { url: 'https://www.themoviedb.org/movie/999999999', rating: 'GOOD' }),
        422, 'Não encontramos esse título no TMDb.');
    });
  });

  test('an unknown movie id: 404', async () => {
    await expectProblem(rate(1, { movieId: 999_999, rating: 'GOOD' }), 404, 'Título não encontrado.');
  });

  test('rating a movie twice by its id: 409', async () => {
    await expectProblem(rate(1, { movieId: 1, rating: 'GOOD' }), 409, 'Você já avaliou esse filme.');
    await expectProblem(rate(2, { movieId: 3, rating: 'GOOD' }), 409, 'Você já avaliou essa série.');
  });

  test('rating a movie twice: 409 (found by its IMDb link)', async () => {
    await expectProblem(rate(1, { url: 'https://www.imdb.com/title/tt1000001/', rating: 'GOOD' }),
      409, 'Você já avaliou esse filme.');
  });

  test('rating a series twice: 409 (found by its TMDb link)', async () => {
    await expectProblem(rate(2, { url: 'https://www.themoviedb.org/tv/10003-snowpiercer', rating: 'GOOD' }),
      409, 'Você já avaliou essa série.');
  });

  test('rating a known movie: 201, it tops the list, and Telegram gets an escaped HTML message', async () => {
    const movie = movieById(4);
    const comment = 'Ótimo <mesmo> sem imagens & tal.';
    const result = await created(rate(3, {
      url: 'https://www.themoviedb.org/movie/10004', rating: 'VERY_GOOD', comment,
    }));

    expect(result).toEqual({ id: movie.id, slug: movie.slug });
    const [first] = movieListSchema.parse((await get('/movies')).body).data;
    expect(first?.id).toBe(movie.id);
    const ratings = (await detail(movie.id)).ratings;
    expect(ratings).toHaveLength(ratingsOf(movie.id).length + 1);
    expect(ratings.at(-1)).toMatchObject({ rating: 'VERY_GOOD', comment, user: { name: userById(3).name } });

    const message = await nextTelegramMessage();
    expect(message.parse_mode).toBe('HTML');
    expect(message.text).toBe(
      `<a href="${FRONTEND_URL}/movies/4-no-images">No Images (2010)</a>\n\n`
      + '<i>Ótimo &lt;mesmo&gt; sem imagens &amp; tal.</i>\n\n<b>Muito Bom</b> - Carla Dias',
    );
  });

  test('rating a known movie by its id: 201, rated by that user, and Telegram is notified', async () => {
    const movie = movieById(6);
    const result = await created(rate(3, { movieId: movie.id, rating: 'GOOD', comment: '  ' }));

    expect(result).toEqual({ id: movie.id, slug: movie.slug });
    expect((await detail(movie.id)).ratings.at(-1)).toMatchObject({
      rating: 'GOOD', comment: null, user: { id: 3, name: userById(3).name },
    });
    expect((await nextTelegramMessage()).text).toEndWith(`<b>Bom</b> - ${userById(3).name}`);
  });

  test('a new movie from a TMDb link: added from TMDb with both ids, so its IMDb link finds it', async () => {
    await stubTitle('/3/movie/550', 'movie-550');
    const url = 'https://www.themoviedb.org/movie/550-fight-club';
    const result = await created(rate(2, { url, rating: 'UNMISSABLE' }));

    expect(result.slug).toBe('fight-club');
    expect(await detail(result.id)).toMatchObject({
      category: 'movie',
      title: 'Clube da Luta',
      originalTitle: 'Fight Club',
      year: 1999,
      genres: ['Drama', 'Thriller'],
      posterUrl: 'https://image.tmdb.org/t/p/w500/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg',
      rating: { count: 1, average: 'UNMISSABLE', last: 'UNMISSABLE' },
    });
    await expectProblem(rate(2, { url: 'https://www.imdb.com/title/tt0137523/', rating: 'GOOD' }),
      409, 'Você já avaliou esse filme.');
  });

  test('a new series from an IMDb link, through TMDb\'s find', async () => {
    await stubTmdb('/3/find/tt0944947', await tmdbFixture('find-tt0944947'));
    await stubTitle('/3/tv/1399', 'tv-1399');
    const result = await created(rate(3, { url: 'https://www.imdb.com/title/tt0944947/', rating: 'GOOD' }));

    expect(await detail(result.id)).toMatchObject({ category: 'series', originalTitle: 'Game of Thrones', year: 2011 });
    await expectProblem(rate(3, { url: 'https://www.themoviedb.org/tv/1399', rating: 'GOOD' }),
      409, 'Você já avaliou essa série.');
  });

  test('TMDb movie and TV ids are separate: tv/10001 isn\'t movie 1 (movie/10001)', async () => {
    await stubTitle('/3/tv/10001', 'tv-1399', { name: 'Another Show', external_ids: { imdb_id: null } });
    const result = await created(rate(1, { url: 'https://www.themoviedb.org/tv/10001', rating: 'COOL' }));

    expect(result.id).not.toBe(1);
    expect(await detail(result.id)).toMatchObject({ category: 'series', title: 'Another Show' });
    expect(listedMovies().map(m => m.id)).not.toContain(result.id);
  });
});
