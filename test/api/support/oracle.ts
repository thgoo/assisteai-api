// Expected values derived from the dataset, written independently of the app (doc 05 rules).
import type { FixtureMovie, FixtureRating, RatingKey } from '../../fixtures/dataset';
import { movies, RATING_KEYS, ratings, users } from '../../fixtures/dataset';

export const PAGE_SIZE = 24;
const RANDOM_ELIGIBLE_RATINGS: readonly RatingKey[] = ['UNMISSABLE', 'VERY_GOOD', 'GOOD', 'COOL'];

export function movieById(id: number): FixtureMovie {
  const movie = movies.find(m => m.id === id);
  if (!movie) throw new Error(`No fixture movie ${id}`);
  return movie;
}

export function userById(id: number) {
  const user = users.find(u => u.id === id);
  if (!user) throw new Error(`No fixture user ${id}`);
  return user;
}

/** Oldest first (ties by id), like the API lists them. */
export function ratingsOf(movieId: number): FixtureRating[] {
  return ratings
    .filter(r => r.movieId === movieId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
}

function latest(list: FixtureRating[]): FixtureRating | undefined {
  return list.at(-1);
}

export function ratingSummary(movieId: number) {
  const list = ratingsOf(movieId);
  if (list.length === 0) return { count: 0, average: null, last: null };
  const mean = list.reduce((sum, r) => sum + RATING_KEYS.indexOf(r.rating), 0) / list.length;
  return { count: list.length, average: RATING_KEYS[Math.round(mean)] ?? null, last: latest(list)?.rating ?? null };
}

export function posterUrl(movie: FixtureMovie): string | null {
  return movie.posterPath === null ? null : `https://image.tmdb.org/t/p/w500${movie.posterPath}`;
}

export function backdropUrl(movie: FixtureMovie): string | null {
  return movie.backdropPath === null ? null : `https://image.tmdb.org/t/p/w1280${movie.backdropPath}`;
}

/** Rated movies, most recently rated first, ties by highest id. */
export function listedMovies(): FixtureMovie[] {
  return movies
    .map(movie => ({ movie, last: latest(ratingsOf(movie.id)) }))
    .filter((entry): entry is { movie: FixtureMovie; last: FixtureRating } => entry.last !== undefined)
    .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt) || b.movie.id - a.movie.id)
    .map(entry => entry.movie);
}

export function randomEligibleMovies(): FixtureMovie[] {
  return movies.filter(m => m.backdropPath !== null
    && ratingsOf(m.id).some(r => RANDOM_ELIGIBLE_RATINGS.includes(r.rating)));
}

export function movieSummary(movie: FixtureMovie) {
  return {
    id: movie.id,
    slug: movie.slug,
    category: movie.category,
    title: movie.title,
    originalTitle: movie.originalTitle,
    year: movie.year,
    posterUrl: posterUrl(movie),
    rating: ratingSummary(movie.id),
  };
}

export function movieDetail(movie: FixtureMovie) {
  return {
    ...movieSummary(movie),
    genres: movie.genres,
    description: movie.description,
    backdropUrl: backdropUrl(movie),
    ratings: ratingsOf(movie.id).map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: new Date(r.createdAt).toISOString(),
      user: { name: userById(r.userId).name, avatarUrl: userById(r.userId).avatarUrl },
    })),
  };
}

export interface ListFilters {
  q?: string;
  category?: 'movie' | 'series';
  genre?: string;
  averages?: RatingKey[];
  ratedBy?: number;
  unratedBy?: number;
}

export type ListSort = 'recent' | 'rating' | 'popular';

/** Lowercase without accents, like Postgres' `lower(unaccent(…))` for these names. */
export function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function meanScore(movieId: number): number {
  const list = ratingsOf(movieId);
  return list.reduce((sum, r) => sum + RATING_KEYS.indexOf(r.rating), 0) / list.length;
}

function ratedByUser(movieId: number, userId: number): boolean {
  return ratings.some(r => r.movieId === movieId && r.userId === userId);
}

/** Rated movies that pass every filter, in the sort's order (doc 05). */
export function filteredMovies(filters: ListFilters, sort: ListSort = 'recent'): FixtureMovie[] {
  const { q, category, genre, averages, ratedBy, unratedBy } = filters;
  const matches = (movie: FixtureMovie) =>
    (q === undefined || [movie.title, movie.originalTitle].some(t => folded(t).includes(folded(q))))
    && (category === undefined || movie.category === category)
    && (genre === undefined || movie.genres.includes(genre))
    && (averages === undefined || averages.some(key => key === ratingSummary(movie.id).average))
    && (ratedBy === undefined || ratedByUser(movie.id, ratedBy))
    && (unratedBy === undefined || !ratedByUser(movie.id, unratedBy));

  const lastRatedAt = (movie: FixtureMovie) => latest(ratingsOf(movie.id))?.createdAt ?? '';
  const count = (movie: FixtureMovie) => ratingsOf(movie.id).length;
  const compare: Record<ListSort, (a: FixtureMovie, b: FixtureMovie) => number> = {
    recent: (a, b) => lastRatedAt(b).localeCompare(lastRatedAt(a)),
    rating: (a, b) => meanScore(b.id) - meanScore(a.id) || count(b) - count(a),
    popular: (a, b) => count(b) - count(a) || lastRatedAt(b).localeCompare(lastRatedAt(a)),
  };
  return listedMovies().filter(matches).sort((a, b) => compare[sort](a, b) || b.id - a.id);
}

/** Byte order of the folded name, then of the name: the API's order for names. */
function byName(a: string, b: string): number {
  const order = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return order(folded(a), folded(b)) || order(a, b);
}

export function genreCounts(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const movie of listedMovies()) {
    for (const genre of movie.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => byName(a.name, b.name));
}

export function raters(): { id: number; name: string; avatarUrl: string | null; ratingCount: number }[] {
  return users
    .map(user => ({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      ratingCount: ratings.filter(r => r.userId === user.id).length,
    }))
    .filter(user => user.ratingCount > 0)
    .sort((a, b) => byName(a.name, b.name) || a.id - b.id);
}
