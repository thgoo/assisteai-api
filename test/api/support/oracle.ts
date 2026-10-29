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
