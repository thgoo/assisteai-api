// Prints the legacy MariaDB seed: the production DDL followed by the contract dataset in the legacy columns.
//   bun test/legacy-env/seed.ts > seed.sql

import { movies, threads, users } from '../fixtures/dataset';

type SqlValue = number | string | null;

function literal(value: SqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', '\'\'')}'`;
}

// ISO UTC → MariaDB TIMESTAMP literal (the session runs in UTC, see schema.sql).
function timestamp(iso: string): string {
  return iso.replace('T', ' ').replace(/(\.\d+)?Z$/, '');
}

function insert(table: string, rows: Record<string, SqlValue>[]): string {
  const [first] = rows;
  if (!first) return '';
  const columns = Object.keys(first).map(c => `\`${c}\``).join(', ');
  const values = rows.map(row => `(${Object.values(row).map(literal).join(', ')})`).join(',\n  ');
  return `INSERT INTO \`${table}\` (${columns}) VALUES\n  ${values};\n`;
}

const LEGACY_PROVIDER = { facebook: 'Facebook', google: 'google' } as const;

const statements = [
  insert('users', users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar ?? '',
    theme: u.theme,
    provider: LEGACY_PROVIDER[u.provider],
    provider_id: u.providerId,
    last_login_at: timestamp(u.lastLoginAt),
    created_at: timestamp(u.createdAt),
    updated_at: timestamp(u.lastLoginAt),
  }))),
  insert('movies', movies.map(m => ({
    id: m.id,
    title: m.title,
    original_title: m.originalTitle,
    year: m.year,
    slug: m.slug,
    category: m.category,
    genre: m.genre,
    description: m.description,
    original_description: m.originalDescription,
    poster_path: m.posterPath,
    backdrop_path: m.backdropPath,
    created_at: timestamp(m.createdAt),
    updated_at: timestamp(m.createdAt),
  }))),
  insert('external_ids', movies.flatMap(m => [
    { name: 'tmdb', external_id: m.tmdbId, movie_id: m.id },
    ...(m.imdbId === null ? [] : [{ name: 'imdb', external_id: m.imdbId, movie_id: m.id }]),
  ])),
  insert('threads', threads.map(t => ({
    id: t.id,
    rating: t.rating,
    comment: t.comment,
    user_id: t.userId,
    movie_id: t.movieId,
    created_at: timestamp(t.createdAt),
    updated_at: timestamp(t.createdAt),
  }))),
];

const schema = await Bun.file(new URL('schema.sql', import.meta.url)).text();
console.log(`${schema}\n${statements.join('\n')}\nSET FOREIGN_KEY_CHECKS = 1;`);
