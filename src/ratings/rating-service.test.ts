import { describe, expect, mock, test } from 'bun:test';
import type { Database } from '~/db/client';
import type { TmdbTitle } from '~/integrations/tmdb/tmdb-client';
import type { Logger } from '~/logger';
import type { MovieResolver } from '~/movies/movie-resolver';
import { ProblemError } from '~/http/errors';
import { RatingService } from './rating-service';

/** A service whose resolver knows no stored movie and gets the title from `fetchTitle`. No database involved. */
function serviceFetching(fetchTitle: () => Promise<TmdbTitle | undefined>) {
  const error = mock();
  const logger = { debug: mock(), info: mock(), warn: mock(), error, child: () => logger } as Logger;
  const notify = mock();
  const resolver = { find: () => Promise.resolve(undefined), fetchTitle } as unknown as MovieResolver;
  const service = new RatingService({} as Database, resolver, { notify }, logger);
  return { service, error, notify };
}

async function problemFrom(promise: Promise<unknown>): Promise<ProblemError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProblemError) return error;
    throw error;
  }
  throw new Error('Expected a ProblemError');
}

const input = {
  userId: 1, target: { url: 'https://www.themoviedb.org/movie/550' }, rating: 'GOOD', comment: null,
} as const;

describe('RatingService', () => {
  test('TMDb failing: 502, logged at error level, nothing notified', async () => {
    const failure = new Error('TMDb /3/movie/550 failed with 503');
    const { service, error, notify } = serviceFetching(() => Promise.reject(failure));

    const problem = await problemFrom(service.create(input));

    expect(problem.status).toBe(502);
    expect(problem.detail).toBe('Não foi possível falar com o TMDb agora. Tente de novo.');
    expect(problem.errors).toBeUndefined();
    expect(error).toHaveBeenCalledWith('TMDb title fetch failed', { error: failure });
    expect(notify).not.toHaveBeenCalled();
  });

  test('a title TMDb doesn\'t know: 404 without field errors, nothing logged', async () => {
    const { service, error } = serviceFetching(() => Promise.resolve(undefined));

    const problem = await problemFrom(service.create(input));

    expect(problem.status).toBe(404);
    expect(problem.detail).toBe('Não encontramos esse título no TMDb.');
    expect(problem.errors).toBeUndefined();
    expect(error).not.toHaveBeenCalled();
  });
});
