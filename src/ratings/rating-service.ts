import { eq } from 'drizzle-orm';
import type { RatingNotifier } from './rating-notifier';
import type { Database, Transaction } from '~/db/client';
import type { RatingKey } from '~/domain/ratings';
import type { Movie, MovieResolver } from '~/movies/movie-resolver';
import { isUniqueViolation } from '~/db/errors';
import { ratings, users } from '~/db/schema';
import { ProblemError } from '~/http/errors';
import { parseTitleLink } from './title-link';

/** What's being rated: a title by its IMDb or TMDb link, or a movie already here. */
export type RatingTarget = { url: string } | { movieId: number };

export interface NewRatingInput {
  userId: number;
  target: RatingTarget;
  rating: RatingKey;
  comment: string | null;
}

export const RATING_MESSAGES = {
  invalidLink: 'Link do IMDb ou do TMDb inválido.',
  notOnTmdb: 'Não encontramos esse título no TMDb.',
  unknownMovie: 'Título não encontrado.',
  alreadyRated: { movie: 'Você já avaliou esse filme.', series: 'Você já avaliou essa série.' },
};

export class RatingService {
  constructor(
    private readonly db: Database,
    private readonly movieResolver: MovieResolver,
    private readonly notifier: RatingNotifier,
  ) {}

  /** Rates a movie, adding it from TMDb when a link points to a new title. Returns the rated movie. */
  async create(input: NewRatingInput): Promise<Movie> {
    const { target } = input;
    if ('movieId' in target) {
      const movie = await this.movieResolver.findById(target.movieId);
      if (!movie) throw new ProblemError(404, RATING_MESSAGES.unknownMovie);
      return this.rate(input, () => movie);
    }
    try {
      return await this.rateLinked(input, target.url);
    } catch (error) {
      // Someone added the same title at the same moment: it exists now, so the second attempt rates it.
      if (!isUniqueViolation(error, 'external_ids_source_category_external_id_unique')) throw error;
      return this.rateLinked(input, target.url);
    }
  }

  private async rateLinked(input: NewRatingInput, url: string): Promise<Movie> {
    const link = parseTitleLink(url);
    if (!link) throw urlProblem(RATING_MESSAGES.invalidLink);

    const existing = await this.movieResolver.find(link);
    if (existing) return this.rate(input, () => existing);

    const title = await this.movieResolver.fetchTitle(link);
    if (!title) throw urlProblem(RATING_MESSAGES.notOnTmdb);
    const stored = await this.movieResolver.findByTitle(title);
    return this.rate(input, tx => stored ?? this.movieResolver.insert(tx, title));
  }

  /** Inserts the rating on the movie `movieIn` gives (it may add it in the same transaction), then notifies. */
  private async rate(
    { userId, rating, comment }: NewRatingInput,
    movieIn: (tx: Transaction) => Movie | Promise<Movie>,
  ): Promise<Movie> {
    const { movie, userName } = await this.db.transaction(async tx => {
      const target = await movieIn(tx);
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
