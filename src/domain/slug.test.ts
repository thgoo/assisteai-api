import { expect, test } from 'bun:test';
import { slugify } from './slug';

test.each([
  ['The Matrix', 'the-matrix'],
  ['Amélie (2001)!', 'amelie-2001'],
  ['  Ação em Dobro  ', 'acao-em-dobro'],
  ['Spider-Man: No Way Home', 'spider-man-no-way-home'],
  ['千と千尋の神隠し', ''],
])('slugify(%p) = %p', (text, slug) => {
  expect(slugify(text)).toBe(slug);
});
