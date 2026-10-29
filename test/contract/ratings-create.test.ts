import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { TelegramMessage } from './support/mock';
import { resetDatabase } from './support/database';
import { get, post } from './support/http';
import { mintToken } from './support/jwt';
import { resetMock, stubTmdb, telegramMessages } from './support/mock';
import { label, movieById, threadsOf, userById } from './support/oracle';
import { errorResponseSchema, movieDetailsResponseSchema, movieListSchema, statusErrorSchema } from './support/schemas';
import { byTarget, target } from './support/target';

const FIGHT_CLUB = {
  en: {
    id: 550, title: 'Fight Club', original_title: 'Fight Club', release_date: '1999-10-15',
    overview: 'An insomniac office worker and a soap maker form an underground fight club.',
    genres: [{ id: 18, name: 'Drama' }], poster_path: '/fc-poster.jpg', backdrop_path: '/fc-backdrop.jpg',
    imdb_id: 'tt0137523', external_ids: { imdb_id: 'tt0137523' },
  },
  pt: {
    id: 550, title: 'Clube da Luta', original_title: 'Fight Club', release_date: '1999-10-15',
    overview: 'Um funcionário insone e um fabricante de sabão formam um clube da luta clandestino.',
    genres: [{ id: 18, name: 'Drama' }], poster_path: '/fc-poster-pt.jpg', backdrop_path: '/fc-backdrop-pt.jpg',
    imdb_id: 'tt0137523', external_ids: { imdb_id: 'tt0137523' },
  },
};

const GAME_OF_THRONES = {
  find: { movie_results: [], tv_results: [{ id: 1399, name: 'Game of Thrones' }] },
  en: {
    id: 1399, name: 'Game of Thrones', original_name: 'Game of Thrones', first_air_date: '2011-04-17',
    overview: 'Seven noble families fight for control of the mythical land of Westeros.',
    genres: [{ id: 10765, name: 'Sci-Fi & Fantasy' }, { id: 18, name: 'Drama' }],
    poster_path: '/got-poster.jpg', backdrop_path: '/got-backdrop.jpg', external_ids: { imdb_id: 'tt0944947' },
  },
  pt: {
    id: 1399, name: 'A Guerra dos Tronos', original_name: 'Game of Thrones', first_air_date: '2011-04-17',
    overview: 'Sete famílias nobres lutam pelo controle da terra mítica de Westeros.',
    genres: [{ id: 10765, name: 'Ficção científica e fantasia' }],
    poster_path: '/got-poster-pt.jpg', backdrop_path: '/got-backdrop-pt.jpg', external_ids: { imdb_id: 'tt0944947' },
  },
};

const MESSAGES = {
  urlRequired: 'É obrigatório o preenchimento do campo "Link IMDb/TMDb".',
  urlInvalid: 'A URL do campo "Link IMDb/TMDb" é inválida.',
  ratingRequired: 'É obrigatório o preenchimento do campo "Avaliação".',
  ratingInvalid: 'O campo "Avaliação" não possui um valor válido.',
  linkInvalid: 'Link IMDb/TMDb inválido.',
  alreadyRatedMovie: 'Você já avaliou esse filme.',
  alreadyRatedSeries: 'Você já avaliou essa série.',
};

/** Legacy failures that become a 422 with the same message on the new app (Q-15, Q-16). */
const ERROR_500_OR_422 = byTarget({ legacy: 500, new: 422 });

async function rate(userId: number | null, body: Record<string, unknown>) {
  return post('/movies/ratings', userId === null ? { json: body } : { json: body, token: mintToken(userId) });
}

async function expectError(responsePromise: ReturnType<typeof rate>, status: number, message: string) {
  const response = await responsePromise;
  expect(response.status).toBe(status);
  expect(errorResponseSchema.parse(response.body)).toEqual({ success: false, message });
}

async function rateSuccessfully(userId: number, body: Record<string, unknown>) {
  const response = await rate(userId, body);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ success: true });
}

async function firstPage() {
  return movieListSchema.parse((await get('/movies?page=1')).body).data;
}

async function firstListedMovie() {
  const [first] = await firstPage();
  if (!first) throw new Error('The list is empty');
  return first;
}

/** Ratings made by these tests can share a second, and the list order has no tie-breaker, so find by slug. */
async function listedMovieBySlug(slug: string) {
  const found = (await firstPage()).find(m => m.slug === slug);
  if (!found) throw new Error(`${slug} is not on the first page`);
  return found;
}

async function details(id: number) {
  return movieDetailsResponseSchema.parse((await get(`/movies/${id}`)).body).data;
}

async function onlyTelegramMessage(): Promise<TelegramMessage> {
  const messages = await telegramMessages();
  expect(messages).toHaveLength(1);
  const [message] = messages;
  if (!message) throw new Error('No Telegram message');
  return message;
}

/** Same content on both; the new app switches to HTML with escaping (Q-22) and a configurable front URL (Q-23). */
interface TelegramParts {
  title: string;
  link: string;
  excerpt: string;
  rating: string;
  user: string;
}

function expectTelegramMessage(message: TelegramMessage, parts: TelegramParts) {
  expect(message.parse_mode).toBe(byTarget({ legacy: 'Markdown', new: 'HTML' }));
  for (const part of [parts.title, parts.link, parts.excerpt, parts.rating, parts.user]) {
    expect(message.text).toContain(part);
  }
  if (target === 'legacy') {
    expect(message.text).toBe(
      `[${parts.title}](https://beta2.assisteai.com.br${parts.link})\n\n`
      + `_${parts.excerpt}_\n\n*${parts.rating}* - ${parts.user}`,
    );
  }
}

describe('POST /movies/ratings', () => {
  beforeAll(resetDatabase);
  afterAll(resetDatabase);
  beforeEach(resetMock);

  test('without a token: 401 HTTP_UNAUTHORIZED (the front shows its own login toast)', async () => {
    const response = await rate(null, { url: 'https://www.imdb.com/title/tt1000001/', rating: 'GOOD' });

    expect(response.status).toBe(401);
    expect(statusErrorSchema.parse(response.body))
      .toEqual({ success: false, status: 401, message: 'HTTP_UNAUTHORIZED' });
  });

  describe('validation: 422 with the first pt-BR message (shown to the user)', () => {
    test('url missing', () => expectError(rate(1, { rating: 'GOOD' }), 422, MESSAGES.urlRequired));
    test('url missing comes before rating missing', () => expectError(rate(1, {}), 422, MESSAGES.urlRequired));
    test('url not a URL', () => expectError(rate(1, { url: 'not a url', rating: 'GOOD' }), 422, MESSAGES.urlInvalid));
    test('rating missing', () =>
      expectError(rate(1, { url: 'https://www.imdb.com/title/tt1000001/' }), 422, MESSAGES.ratingRequired));
  });

  // On legacy the bad row stays and every list page that shows the movie answers 500 (Q-15), so the database is
  // reset right after this test.
  test('an unknown rating key: legacy stores it and crashes (Q-15), the new app answers 422', async () => {
    try {
      await expectError(
        rate(3, { url: 'https://www.themoviedb.org/movie/10031', rating: 'AMAZING' }),
        ERROR_500_OR_422,
        byTarget({ legacy: 'Erro catastrófico.', new: MESSAGES.ratingInvalid }),
      );
      expect((await get('/movies?page=1')).status).toBe(byTarget({ legacy: 500, new: 200 }));
    } finally {
      await resetDatabase();
    }
  });

  test('a URL that is neither IMDb nor TMDb: "Link IMDb/TMDb inválido." (500 on legacy, Q-16)', () =>
    expectError(rate(1, { url: 'https://example.com/movie', rating: 'GOOD' }), ERROR_500_OR_422, MESSAGES.linkInvalid));

  test('rating a movie twice: 409 "Você já avaliou esse filme." (found by its IMDb link)', () =>
    expectError(
      rate(1, { url: 'https://www.imdb.com/title/tt1000001/', rating: 'GOOD' }),
      409,
      MESSAGES.alreadyRatedMovie,
    ));

  test('rating a series twice: 409 "Você já avaliou essa série." (found by its TMDb link)', () =>
    expectError(
      rate(2, { url: 'https://www.themoviedb.org/tv/10003-snowpiercer', rating: 'GOOD' }),
      409,
      MESSAGES.alreadyRatedSeries,
    ));

  test('rating a known movie adds the rating, moves the movie to the top and notifies Telegram', async () => {
    const movie = movieById(4);
    const carla = userById(3);
    await rateSuccessfully(carla.id, {
      url: 'https://www.themoviedb.org/movie/10004', rating: 'VERY_GOOD', comment: 'Ótimo, mesmo sem imagens.',
    });

    expect((await firstListedMovie()).id).toBe(movie.id);
    const data = await details(movie.id);
    expect(data.rating.count).toBe(threadsOf(movie.id).length + 1);
    expect(data.rating.last).toBe(label('VERY_GOOD'));
    expect(data.rating.list.at(-1)).toMatchObject({ rating: label('VERY_GOOD'), user: { name: carla.name } });

    expectTelegramMessage(await onlyTelegramMessage(), {
      title: `${movie.originalTitle} (${movie.year ?? ''})`,
      link: `/movies/${movie.id}-${movie.slug}`,
      excerpt: 'Ótimo, mesmo sem imagens.',
      rating: label('VERY_GOOD'),
      user: carla.name,
    });
  });

  test('an empty comment means "no comment": Telegram gets the description, cut to 180 chars', async () => {
    const movie = movieById(5);
    await rateSuccessfully(1, { url: 'https://www.themoviedb.org/movie/10005', rating: 'BAD', comment: '' });

    const message = await onlyTelegramMessage();
    expect(message.text).toContain('Descrição de Stay Away From Me...');
    expect(movie.description.length).toBeLessThan(180);
  });

  test('a new movie from a TMDb link is created from TMDb (pt-BR text, en-US genres and images)', async () => {
    await stubTmdb('/3/movie/550', FIGHT_CLUB.en, { language: 'en-US' });
    await stubTmdb('/3/movie/550', FIGHT_CLUB.pt, { language: 'pt-BR' });
    await rateSuccessfully(2, { url: 'https://www.themoviedb.org/movie/550-fight-club', rating: 'UNMISSABLE' });

    const listed = await listedMovieBySlug('fight-club');
    expect(listed).toMatchObject({
      category: 'MOVIE',
      title: 'Clube da Luta',
      average_rating: label('UNMISSABLE'),
      last_rating: label('UNMISSABLE'),
      rating_count: 1,
    });
    expect(await details(listed.id)).toMatchObject({
      title: 'Clube da Luta',
      original_title: 'Fight Club',
      description: FIGHT_CLUB.pt.overview,
      genre: 'Drama',
      year: '1999',
      poster_path: 'https://image.tmdb.org/t/p/w500/fc-poster.jpg',
      backdrop_path: 'https://image.tmdb.org/t/p/w1280/fc-backdrop.jpg',
    });
  });

  test('a new series from an IMDb link is created through TMDb find, and its TMDb link then finds it', async () => {
    await stubTmdb('/3/find/tt0944947', GAME_OF_THRONES.find);
    await stubTmdb('/3/tv/1399', GAME_OF_THRONES.en, { language: 'en-US' });
    await stubTmdb('/3/tv/1399', GAME_OF_THRONES.pt, { language: 'pt-BR' });
    await rateSuccessfully(3, { url: 'https://www.imdb.com/title/tt0944947/', rating: 'GOOD' });

    const listed = await listedMovieBySlug('game-of-thrones');
    expect(listed).toMatchObject({ category: 'SERIE', title: 'A Guerra dos Tronos' });
    expect(await details(listed.id)).toMatchObject({
      original_title: 'Game of Thrones',
      genre: 'Sci-Fi & Fantasy,Drama',
      year: '2011',
    });

    await expectError(
      rate(3, { url: 'https://www.themoviedb.org/tv/1399-game-of-thrones', rating: 'GOOD' }),
      409,
      MESSAGES.alreadyRatedSeries,
    );
  });
});
