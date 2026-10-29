import { describe, expect, test } from 'bun:test';
import type { TitleLink } from './title-link';
import { parseTitleLink } from './title-link';

describe('parseTitleLink', () => {
  test.each<[string, TitleLink]>([
    ['https://www.imdb.com/title/tt0133093/', { source: 'imdb', imdbId: 'tt0133093' }],
    ['https://www.imdb.com/title/tt0133093', { source: 'imdb', imdbId: 'tt0133093' }],
    ['https://m.imdb.com/title/tt0944947/?ref_=nv_sr_1', { source: 'imdb', imdbId: 'tt0944947' }],
    ['https://www.imdb.com/pt/title/tt10872600/', { source: 'imdb', imdbId: 'tt10872600' }],
    ['https://www.themoviedb.org/movie/603-the-matrix', { source: 'tmdb', category: 'movie', tmdbId: '603' }],
    ['https://www.themoviedb.org/movie/603?language=pt-BR', { source: 'tmdb', category: 'movie', tmdbId: '603' }],
    ['https://themoviedb.org/tv/1399-game-of-thrones/', { source: 'tmdb', category: 'series', tmdbId: '1399' }],
  ])('%s', (link, expected) => {
    expect(parseTitleLink(link)).toEqual(expected);
  });

  test.each([
    'not a url',
    'ftp://www.imdb.com/title/tt0133093/',
    'https://www.imdb.com/name/nm0000206/',
    'https://www.imdb.com/title/tt0133093extra/',
    'https://www.themoviedb.org/person/6384-keanu-reeves',
    'https://www.themoviedb.org/movie/',
    'https://evil.example/www.imdb.com/title/tt0133093/',
    'https://imdb.com.evil.example/title/tt0133093/',
  ])('rejects %s', link => {
    expect(parseTitleLink(link)).toBeUndefined();
  });
});
