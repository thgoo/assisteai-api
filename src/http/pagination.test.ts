import { describe, expect, test } from 'bun:test';
import { lengthAwarePage, pageParam } from './pagination';

const URL = 'http://api.test/movies?page=2&other=1';

describe('pageParam', () => {
  test.each([
    ['2', 2],
    [undefined, 1],
    ['0', 1],
    ['-1', 1],
    ['1.5', 1],
    ['2abc', 1],
    ['99999999999999999999', 1],
  ])('%p → %d', (input, page) => {
    expect(pageParam(24).parse(input)).toBe(page);
  });
});

describe('lengthAwarePage', () => {
  test('a middle page links both ways, without the other query parameters', () => {
    expect(lengthAwarePage({ items: ['c', 'd'], total: 6 }, { page: 2, perPage: 2 }, URL)).toEqual({
      current_page: 2,
      data: ['c', 'd'],
      first_page_url: 'http://api.test/movies?page=1',
      from: 3,
      last_page: 3,
      last_page_url: 'http://api.test/movies?page=3',
      next_page_url: 'http://api.test/movies?page=3',
      path: 'http://api.test/movies',
      per_page: 2,
      prev_page_url: 'http://api.test/movies?page=1',
      to: 4,
      total: 6,
    });
  });

  test('past the last page: no items, from/to null, previous page still linked', () => {
    expect(lengthAwarePage({ items: [], total: 6 }, { page: 5, perPage: 2 }, URL)).toMatchObject({
      from: null,
      to: null,
      last_page: 3,
      next_page_url: null,
      prev_page_url: 'http://api.test/movies?page=4',
    });
  });

  test('no items at all: last_page is 1', () => {
    expect(lengthAwarePage({ items: [], total: 0 }, { page: 1, perPage: 2 }, URL)).toMatchObject({
      last_page: 1,
      next_page_url: null,
      prev_page_url: null,
    });
  });
});
