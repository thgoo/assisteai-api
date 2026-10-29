// Replaces the database contents with the test dataset (test/fixtures/dataset.ts). Also the API tests' database
// reset (RESET_DB_COMMAND).
//   bun run db:seed
import { getTableName, sql } from 'drizzle-orm';
import { loadDatabaseConfig } from '~/config';
import { createDatabase } from '~/db/client';
import { externalIds, movies, ratings, sessions, users } from '~/db/schema';
import { movies as fixtureMovies, ratings as fixtureRatings, users as fixtureUsers } from '../test/fixtures/dataset';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres']);

const { url } = loadDatabaseConfig();
const { hostname } = new URL(url);
if (!LOCAL_HOSTS.has(hostname)) {
  throw new Error(`Refusing to wipe a non-local database (${hostname}). The seed is for local and CI databases only.`);
}

const { db, close } = createDatabase(url);
const tables = [users, movies, externalIds, ratings, sessions];

try {
  await db.transaction(async tx => {
    await tx.execute(sql`TRUNCATE ${sql.join(tables, sql`, `)} RESTART IDENTITY CASCADE`);

    await tx.insert(users).values(fixtureUsers.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      googleSub: user.googleSub,
      avatarUrl: user.avatarUrl,
      lastLoginAt: new Date(user.lastLoginAt),
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.lastLoginAt),
    })));

    await tx.insert(movies).values(fixtureMovies.map(movie => ({
      id: movie.id,
      title: movie.title,
      originalTitle: movie.originalTitle,
      year: movie.year,
      slug: movie.slug,
      category: movie.category,
      genres: movie.genres,
      description: movie.description,
      originalDescription: movie.originalDescription,
      posterPath: movie.posterPath,
      backdropPath: movie.backdropPath,
      createdAt: new Date(movie.createdAt),
      updatedAt: new Date(movie.createdAt),
    })));

    await tx.insert(externalIds).values(fixtureMovies.flatMap(movie => [
      { movieId: movie.id, source: 'tmdb' as const, category: movie.category, externalId: movie.tmdbId },
      ...(movie.imdbId === null ? [] : [{ movieId: movie.id, source: 'imdb' as const, externalId: movie.imdbId }]),
    ]));

    await tx.insert(ratings).values(fixtureRatings.map(rating => ({
      id: rating.id,
      userId: rating.userId,
      movieId: rating.movieId,
      rating: rating.rating,
      comment: rating.comment,
      createdAt: new Date(rating.createdAt),
      updatedAt: new Date(rating.createdAt),
    })));

    // Explicit ids don't advance the identity sequences: move them past the seeded rows.
    for (const table of [users, movies, ratings]) {
      await tx.execute(sql`
        SELECT setval(pg_get_serial_sequence(${getTableName(table)}, 'id'), max(id)) FROM ${table}
      `);
    }
  });

  console.log(`Seeded ${fixtureUsers.length} users, ${fixtureMovies.length} movies, ${fixtureRatings.length} ratings`);
} finally {
  await close();
}
