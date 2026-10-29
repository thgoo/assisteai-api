// The test dataset: the single source for the seed (scripts/seed.ts) and for the expectations of the API tests
// (test/api/support/oracle.ts). Every case a test relies on is called out next to the row that provides it.

export const RATING_KEYS = ['STAY_AWAY', 'VERY_BAD', 'BAD', 'COOL', 'GOOD', 'VERY_GOOD', 'UNMISSABLE'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export interface FixtureUser {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  /** Null: never signed in with Google (gets linked by email on the first Google sign-in). */
  googleSub: string | null;
  lastLoginAt: string;
  createdAt: string;
}

export interface FixtureMovie {
  id: number;
  title: string;
  originalTitle: string;
  year: number | null;
  slug: string;
  category: 'movie' | 'series';
  genres: string[];
  description: string;
  originalDescription: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  tmdbId: string;
  imdbId: string | null;
  createdAt: string;
}

export interface FixtureRating {
  id: number;
  userId: number;
  movieId: number;
  rating: RatingKey;
  comment: string | null;
  createdAt: string;
}

export const users: FixtureUser[] = [
  {
    id: 1,
    name: 'Ana Souza',
    email: 'ana@example.com',
    avatarUrl: 'https://lh3.googleusercontent.com/a/ana=s96-c',
    googleSub: '100000000000000000001',
    lastLoginAt: '2026-10-01T12:00:00Z',
    createdAt: '2015-09-11T20:26:44Z',
  },
  {
    id: 2,
    name: 'Bruno Lima',
    email: 'bruno@example.com',
    avatarUrl: null,
    googleSub: null,
    lastLoginAt: '2019-02-06T23:11:09Z',
    createdAt: '2016-01-15T19:22:35Z',
  },
  {
    id: 3,
    name: 'Carla Dias',
    email: 'carla@example.com',
    avatarUrl: 'https://lh3.googleusercontent.com/a/carla=s96-c',
    googleSub: '100000000000000000003',
    lastLoginAt: '2026-09-20T08:30:00Z',
    createdAt: '2018-03-11T11:06:03Z',
  },
];

function movie(id: number, fields: Partial<FixtureMovie> & Pick<FixtureMovie, 'originalTitle'>): FixtureMovie {
  const slug = fields.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    title: fields.originalTitle,
    year: 2010,
    slug,
    category: 'movie',
    genres: ['Drama'],
    description: `Descrição de ${fields.originalTitle}.`,
    originalDescription: `Overview of ${fields.originalTitle}.`,
    posterPath: `/poster-${id}.jpg`,
    backdropPath: `/backdrop-${id}.jpg`,
    tmdbId: String(10_000 + id),
    imdbId: `tt${String(1_000_000 + id)}`,
    createdAt: '2015-09-11T20:27:01Z',
    ...fields,
  };
}

const specialMovies: FixtureMovie[] = [
  // Three ratings: average VERY_GOOD, last UNMISSABLE (not the highest id).
  movie(1, { title: 'Matrix', originalTitle: 'The Matrix', year: 1999, genres: ['Action', 'Science Fiction'] }),
  // Two ratings with mean score 2.5: the average rounds up to COOL.
  movie(2, { title: 'Ação em Dobro', originalTitle: 'Double Action', genres: ['Ação', 'Comédia'] }),
  // A series.
  movie(3, { originalTitle: 'Snowpiercer', category: 'series', year: 2020, genres: ['Drama', 'Sci-Fi & Fantasy'] }),
  // No poster and no backdrop: null image URLs, never picked by /movies/random.
  movie(4, { originalTitle: 'No Images', posterPath: null, backdropPath: null }),
  // Only bad ratings: never picked by /movies/random.
  movie(5, { originalTitle: 'Stay Away From Me' }),
  // No year, no IMDb id, no genres.
  movie(6, { originalTitle: 'Unknown Year', year: null, imdbId: null, genres: [] }),
];

const FILLER_IDS = Array.from({ length: 24 }, (_, i) => i + 7);

// 30 rated movies → the first page has 24, the second 6. Movie 31 has no ratings: not listed, empty rating block.
export const movies: FixtureMovie[] = [
  ...specialMovies,
  ...FILLER_IDS.map(id => movie(id, { originalTitle: `Filler Movie ${id}` })),
  movie(31, { originalTitle: 'Never Rated' }),
];

const FILLER_RATINGS: RatingKey[] = ['GOOD', 'VERY_GOOD', 'UNMISSABLE', 'COOL'];

/**
 * Filler ratings are older than the special ones, one day apart, so the list is the specials (by their latest rating),
 * then fillers 30 → 7. Fillers 12 and 13 are rated at the same second, right across the page boundary
 * (13 is the 24th item, 12 the 25th): the cursor must neither repeat nor skip one of them.
 */
function fillerRatedAt(movieId: number): string {
  const day = movieId === 13 ? 12 - 7 : movieId - 7;
  return new Date(Date.UTC(2020, 0, 1 + day, 12)).toISOString().replace('.000Z', 'Z');
}

const fillerRatings: Omit<FixtureRating, 'id'>[] = FILLER_IDS.map((movieId, i) => ({
  userId: (i % users.length) + 1,
  movieId,
  rating: FILLER_RATINGS[i % FILLER_RATINGS.length] ?? 'GOOD',
  comment: null,
  createdAt: fillerRatedAt(movieId),
}));

const specialRatings: Omit<FixtureRating, 'id'>[] = [
  { userId: 2, movieId: 1, rating: 'GOOD', comment: 'Clássico.', createdAt: '2026-08-01T10:00:00Z' },
  { userId: 1, movieId: 1, rating: 'UNMISSABLE', comment: 'Imperdível!', createdAt: '2026-09-15T21:30:00Z' },
  { userId: 3, movieId: 1, rating: 'VERY_GOOD', comment: null, createdAt: '2026-08-20T18:45:00Z' },
  { userId: 1, movieId: 2, rating: 'COOL', comment: 'Diverte.', createdAt: '2026-07-01T09:00:00Z' },
  { userId: 3, movieId: 2, rating: 'BAD', comment: 'Fraco, mas tem "aspas" e ç.', createdAt: '2026-07-02T09:00:00Z' },
  { userId: 2, movieId: 3, rating: 'VERY_GOOD', comment: null, createdAt: '2026-06-10T15:00:00Z' },
  { userId: 1, movieId: 4, rating: 'GOOD', comment: null, createdAt: '2026-05-05T05:05:05Z' },
  { userId: 3, movieId: 5, rating: 'STAY_AWAY', comment: 'Fuja.', createdAt: '2026-04-04T04:04:04Z' },
  { userId: 2, movieId: 5, rating: 'VERY_BAD', comment: null, createdAt: '2026-04-05T04:04:04Z' },
  { userId: 1, movieId: 6, rating: 'COOL', comment: null, createdAt: '2026-03-03T03:03:03Z' },
];

export const ratings: FixtureRating[] = [...specialRatings, ...fillerRatings].map((r, i) => ({ id: i + 1, ...r }));
