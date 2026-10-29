import { eq } from 'drizzle-orm';
import type { RatingNotifier } from './rating-notifier';
import type { Database } from '~/db/client';
import type { RatingKey } from '~/domain/ratings';
import type { Movie, MovieResolver } from '~/movies/movie-resolver';
import { isUniqueViolation } from '~/db/errors';
import { ratings, users } from '~/db/schema';
import { ProblemError } from '~/http/errors';
import { parseTitleLink } from './title-link';

export interface NewRatingInput {
  userId: number;
  url: string;
  rating: RatingKey;
  comment: string | null;
}

export const RATING_MESSAGES = {
  invalidLink: 'Link do IMDb ou do TMDb inválido.',
  notOnTmdb: 'Não encontramos esse título no TMDb.',
  alreadyRated: { movie: 'Você já avaliou esse filme.', series: 'Você já avaliou essa série.' },
};

export class RatingService {
  constructor(
    private readonly db: Database,
    private readonly movieResolver: MovieResolver,
    private readonly notifier: RatingNotifier,
  ) {}

  /** Rates the title a link points to, adding it from TMDb when it's new. Returns the rated movie. */
  async create(input: NewRatingInput): Promise<Movie> {
    try {
      return await this.tryCreate(input);
    } catch (error) {
      // Someone added the same title at the same moment: it exists now, so the second attempt rates it.
      if (!isUniqueViolation(error, 'external_ids_source_category_external_id_unique')) throw error;
      return this.tryCreate(input);
    }
  }

  private async tryCreate({ userId, url, rating, comment }: NewRatingInput): Promise<Movie> {
    const link = parseTitleLink(url);
    if (!link) throw urlProblem(RATING_MESSAGES.invalidLink);

    let existing = await this.movieResolver.find(link);
    const title = existing ? undefined : await this.movieResolver.fetchTitle(link);
    if (!existing && !title) throw urlProblem(RATING_MESSAGES.notOnTmdb);
    if (title) existing = await this.movieResolver.findByTitle(title);

    const { movie, userName } = await this.db.transaction(async tx => {
      const target = existing ?? (title && await this.movieResolver.insert(tx, title));
      if (!target) throw new Error('Unreachable: no movie and no title');
      try {
        await tx.insert(ratings).values({ userId, movieId: target.id, rating, comment });
      } catch (error) {
        if (isUniqueViolation(error, 'ratings_user_id_movie_id_unique')) {
          throw new ProblemError(409, RATING_MESSAGES.alreadyRated[target.category]);
        }
        throw error;
      }
      const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId));
      return { movie: target, userName: user?.name ?? '' };
    });

    this.notifier.notify({ movie, rating, comment, userName });
    return movie;
  }
}

function urlProblem(message: string): ProblemError {
  return new ProblemError(422, message, [{ path: 'url', message }]);
}
