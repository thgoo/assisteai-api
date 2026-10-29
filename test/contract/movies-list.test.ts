import { describe, expect, test } from 'bun:test';
import { get } from './support/http';
import { averageLabel, lastLabel, listedMovies, PAGE_SIZE, posterUrl, threadsOf } from './support/oracle';
import { movieListSchema } from './support/schemas';
import { byTarget } from './support/target';

async function getPage(query: string) {
  const response = await get(`/movies${query}`);
  expect(response.status).toBe(200);
  return { raw: response.body, page: movieListSchema.parse(response.body) };
}

/** The front only checks next_page_url for truthiness, and the host differs per environment: compare path + query. */
function pathOf(url: string | null): string | null {
  if (url === null) return null;
  const { pathname, search } = new URL(url);
  return pathname + search;
}

describe('GET /movies', () => {
  const listed = listedMovies();

  test('first page: 24 movies, most recently rated first, with paging metadata', async () => {
    const { page } = await getPage('?page=1');

    expect(page.data.map(m => m.id)).toEqual(listed.slice(0, PAGE_SIZE).map(m => m.id));
    expect(page).toMatchObject({
      current_page: 1,
      per_page: PAGE_SIZE,
      total: listed.length,
      last_page: Math.ceil(listed.length / PAGE_SIZE),
      from: 1,
      to: PAGE_SIZE,
      prev_page_url: null,
    });
    expect(pathOf(page.next_page_url)).toBe('/movies?page=2');
  });

  test('no page parameter means page 1', async () => {
    const [withoutPage, firstPage] = await Promise.all([getPage(''), getPage('?page=1')]);
    expect(withoutPage.page.data).toEqual(firstPage.page.data);
  });

  test('every item carries the fields the front reads, computed from its ratings', async () => {
    const { page } = await getPage('?page=1');

    for (const item of page.data) {
      const movie = listed.find(m => m.id === item.id);
      expect(movie).toBeDefined();
      if (!movie) continue;
      expect(item).toEqual({
        id: movie.id,
        slug: movie.slug,
        category: movie.category,
        title: movie.title,
        genre: movie.genre,
        description: movie.description,
        poster_path: posterUrl(movie),
        average_rating: averageLabel(movie.id),
        last_rating: lastLabel(movie.id),
        rating_count: threadsOf(movie.id).length,
      } as typeof item);
    }
  });

  test('average rounds half away from zero (mean 2.5 → Legal), like PHP round()', async () => {
    const { page } = await getPage('?page=1');
    expect(page.data.find(m => m.id === 2)?.average_rating).toBe('Legal');
  });

  test('a movie without a poster has poster_path null', async () => {
    const { page } = await getPage('?page=1');
    expect(page.data.find(m => m.id === 4)?.poster_path).toBeNull();
  });

  test('last page: the remaining movies and no next_page_url', async () => {
    const { page } = await getPage('?page=2');

    expect(page.data.map(m => m.id)).toEqual(listed.slice(PAGE_SIZE).map(m => m.id));
    expect(page.next_page_url).toBeNull();
    expect(pathOf(page.prev_page_url)).toBe('/movies?page=1');
  });

  test('past the last page: empty data, no next_page_url', async () => {
    const { page } = await getPage('?page=3');

    expect(page.data).toEqual([]);
    expect(page.next_page_url).toBeNull();
  });

  test('movies without ratings are not listed', async () => {
    const pages = await Promise.all([getPage('?page=1'), getPage('?page=2')]);
    const ids = pages.flatMap(p => p.page.data.map(m => m.id));
    expect(ids).not.toContain(31);
  });

  test('fields the front never reads are dropped by the new app', async () => {
    const { raw } = await getPage('?page=1');
    const [item] = (raw as { data: Record<string, unknown>[] }).data;
    const keys = Object.keys(item ?? {});

    // doc 02 "Scope of v1": watch_later, imdb_link (Q-18) and last_thread are expensive or broken.
    const dropped = ['watch_later', 'imdb_link', 'last_thread'];
    expect(dropped.filter(key => keys.includes(key))).toEqual(byTarget({ legacy: dropped, new: [] }));
  });
});
