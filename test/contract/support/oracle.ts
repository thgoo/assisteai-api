// Expected values derived from the dataset with the legacy rules (doc 01 §5–6). Written independently of the app:
// the suite going green against the legacy PHP is what proves these rules describe reality.
import type { FixtureMovie, FixtureThread, RatingKey } from '../../fixtures/dataset';
import { movies, RATING_KEYS, threads, users } from '../../fixtures/dataset';

export const RATING_LABELS = [
  'Fique Longe', 'Muito Ruim', 'Ruinzinho', 'Legal', 'Bom', 'Muito Bom', 'Imperdível',
] as const;
export type RatingLabel = (typeof RATING_LABELS)[number];

export const PAGE_SIZE = 24;
const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
const RANDOM_ELIGIBLE_RATINGS: readonly RatingKey[] = ['UNMISSABLE', 'VERY_GOOD', 'GOOD', 'COOL'];

export function label(key: RatingKey): RatingLabel {
  const index = RATING_KEYS.indexOf(key);
  const result = RATING_LABELS[index];
  if (result === undefined) throw new Error(`Unknown rating key ${key}`);
  return result;
}

/** PHP round(): half away from zero. */
function phpRound(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function threadsOf(movieId: number): FixtureThread[] {
  return threads.filter(t => t.movieId === movieId).sort((a, b) => a.id - b.id);
}

function latest(list: FixtureThread[]): FixtureThread | undefined {
  return list.reduce<FixtureThread | undefined>((acc, t) => (!acc || t.createdAt > acc.createdAt ? t : acc), undefined);
}

export function averageLabel(movieId: number): RatingLabel | null {
  const list = threadsOf(movieId);
  if (list.length === 0) return null;
  const mean = list.reduce((sum, t) => sum + RATING_KEYS.indexOf(t.rating), 0) / list.length;
  return RATING_LABELS[phpRound(mean)] ?? null;
}

export function lastLabel(movieId: number): RatingLabel | null {
  const thread = latest(threadsOf(movieId));
  return thread ? label(thread.rating) : null;
}

export function posterUrl(m: FixtureMovie): string | null {
  return m.posterPath === null ? null : TMDB_POSTER_BASE + m.posterPath;
}

export function backdropUrl(m: FixtureMovie): string | null {
  return m.backdropPath === null ? null : TMDB_BACKDROP_BASE + m.backdropPath;
}

export function movieById(id: number): FixtureMovie {
  const found = movies.find(m => m.id === id);
  if (!found) throw new Error(`No fixture movie ${id}`);
  return found;
}

export function userById(id: number) {
  const found = users.find(u => u.id === id);
  if (!found) throw new Error(`No fixture user ${id}`);
  return found;
}

/** Movies with at least one rating, most recently rated first. */
export function listedMovies(): FixtureMovie[] {
  return movies
    .map(m => ({ movie: m, last: latest(threadsOf(m.id)) }))
    .filter((entry): entry is { movie: FixtureMovie; last: FixtureThread } => entry.last !== undefined)
    // Legacy has no tie-breaker (Q-25); the new app breaks ties by id. The dataset has no ties, so both agree.
    .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt) || b.movie.id - a.movie.id)
    .map(entry => entry.movie);
}

/** Movies /movies/random may return: with a backdrop and at least one COOL-or-better rating. */
export function randomEligibleMovies(): FixtureMovie[] {
  return movies.filter(m =>
    m.backdropPath !== null && threadsOf(m.id).some(t => RANDOM_ELIGIBLE_RATINGS.includes(t.rating)));
}
