// The JSON shape of title search results (doc 05).
import type { TitleSearchResult } from './title-search-service';
import { tmdbImageUrl, tmdbPageUrl } from '~/integrations/tmdb/tmdb-mapping';

export function titleResult(result: TitleSearchResult) {
  return {
    url: tmdbPageUrl(result.category, result.tmdbId),
    category: result.category,
    title: result.title,
    originalTitle: result.originalTitle,
    year: result.year,
    posterUrl: tmdbImageUrl('w185', result.posterPath),
    ratedByMe: result.ratedByMe,
  };
}
