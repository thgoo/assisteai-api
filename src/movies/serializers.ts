// The legacy JSON shapes of movies (doc 01 §6), minus the fields v1 drops (doc 02 "Scope of v1").
import type { MovieDetail, RatedMovie, RatingSummary, Thread, ThreadWithUser } from './movie-service';
import { averageRatingLabel, ratingLabel } from '~/domain/ratings';
import { laravelDate } from '~/http/dates';

const TMDB_IMAGES = 'https://image.tmdb.org/t/p';

export function posterUrl(path: string | null): string | null {
  return path === null ? null : `${TMDB_IMAGES}/w500${path}`;
}

export function backdropUrl(path: string | null): string | null {
  return path === null ? null : `${TMDB_IMAGES}/w1280${path}`;
}

/** `<Movie>` as a `GET /movies` item. Dropped: `last_thread`, `imdb_link` (Q-18), `watch_later`. */
export function movieListItem(movie: RatedMovie) {
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.originalTitle,
    year: movie.year,
    slug: movie.slug,
    category: movie.category,
    genre: movie.genre,
    description: movie.description,
    poster_path: posterUrl(movie.posterPath),
    backdrop_path: backdropUrl(movie.backdropPath),
    average_rating: averageLabel(movie.rating),
    last_rating: lastLabel(movie.rating),
    rating_count: movie.rating.count,
  };
}

/** `<Thread>` without `deleted_at` (v1 has no soft deletes). */
function thread(row: Thread) {
  return {
    id: row.id,
    rating: ratingLabel(row.rating),
    comment: row.comment,
    user_id: row.userId,
    movie_id: row.movieId,
    created_at: laravelDate(row.createdAt),
    updated_at: laravelDate(row.updatedAt),
  };
}

/** The rater is only `{ name, avatar }`: legacy sent the whole `<User>`, email included (Q-14). */
function threadWithUser(row: ThreadWithUser) {
  return { ...thread(row), user: { name: row.user.name, avatar: row.user.avatar } };
}

/** `<MovieDetail>` (doc 01 §6). `GET /movies/random` lists the threads without their user, like legacy. */
export function movieDetail(movie: MovieDetail, { withUsers }: { withUsers: boolean }) {
  return {
    backdrop_path: backdropUrl(movie.backdropPath),
    original_title: movie.originalTitle,
    description: movie.description,
    poster_path: posterUrl(movie.posterPath),
    title: movie.title,
    genre: movie.genre,
    year: movie.year,
    rating: {
      count: movie.rating.count,
      average: averageLabel(movie.rating),
      last: lastLabel(movie.rating),
      list: movie.threads.map(row => (withUsers ? threadWithUser(row) : thread(row))),
    },
  };
}

function averageLabel({ averageScore }: RatingSummary) {
  return averageScore === null ? null : averageRatingLabel(averageScore);
}

function lastLabel({ lastRating }: RatingSummary) {
  return lastRating === null ? null : ratingLabel(lastRating);
}
