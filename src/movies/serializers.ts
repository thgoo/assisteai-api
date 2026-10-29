// The legacy JSON shapes of movies (doc 01 §6), minus the fields v1 drops (doc 02 "Scope of v1").
import type { RatedMovie } from './movie-service';
import { averageRatingLabel, ratingLabel } from '~/domain/ratings';

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
    average_rating: averageRatingLabel(movie.rating.averageScore),
    last_rating: ratingLabel(movie.rating.lastRating),
    rating_count: movie.rating.count,
  };
}
