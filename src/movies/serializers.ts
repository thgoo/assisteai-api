// The JSON shapes of movies (doc 05).
import type { MovieDetail, RatedMovie, RatingSummary } from './movie-service';
import { averageRating } from '~/domain/ratings';
import { tmdbImageUrl } from '~/integrations/tmdb/tmdb-mapping';

function ratingSummary({ count, meanScore, last }: RatingSummary) {
  return { count, average: meanScore === null ? null : averageRating(meanScore), last };
}

export function movieSummary(movie: RatedMovie) {
  return {
    id: movie.id,
    slug: movie.slug,
    category: movie.category,
    title: movie.title,
    originalTitle: movie.originalTitle,
    year: movie.year,
    posterUrl: tmdbImageUrl('w500', movie.posterPath),
    rating: ratingSummary(movie.summary),
  };
}

export function movieDetail(movie: MovieDetail) {
  return {
    ...movieSummary(movie),
    genres: movie.genres,
    description: movie.description,
    backdropUrl: tmdbImageUrl('w1280', movie.backdropPath),
    ratings: movie.ratings,
  };
}
