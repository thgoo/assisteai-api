// The contract test dataset: the single source for the legacy MariaDB seed (test/legacy-env/seed.ts) and, later,
// the Postgres seed. It describes the data as both systems see it after the ETL, so there are no soft-deleted rows.
// Every case the contract tests rely on is called out next to the row that provides it.

export const RATING_KEYS = ['STAY_AWAY', 'VERY_BAD', 'BAD', 'COOL', 'GOOD', 'VERY_GOOD', 'UNMISSABLE'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export interface FixtureUser {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  theme: string | null;
  provider: 'facebook' | 'google';
  providerId: string;
  lastLoginAt: string;
  createdAt: string;
}

export interface FixtureMovie {
  id: number;
  title: string;
  originalTitle: string;
  year: string | null;
  slug: string;
  category: 'MOVIE' | 'SERIE';
  genre: string;
  description: string;
  originalDescription: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  tmdbId: string;
  imdbId: string | null;
  createdAt: string;
}

export interface FixtureThread {
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
    avatar: 'https://lh3.googleusercontent.com/a/ana=s96-c',
    theme: 'BLUE',
    provider: 'google',
    providerId: '100000000000000000001',
    lastLoginAt: '2026-10-01T12:00:00Z',
    createdAt: '2015-09-11T20:26:44Z',
  },
  {
    // Facebook-era user (can't log in anymore), still shown on old ratings.
    id: 2,
    name: 'Bruno Lima',
    email: 'bruno@example.com',
    avatar: 'https://scontent.xx.fbcdn.net/v/t1.0-1/p120x120/bruno.jpg',
    theme: null,
    provider: 'facebook',
    providerId: '200000000000002',
    lastLoginAt: '2019-02-06T23:11:09Z',
    createdAt: '2016-01-15T19:22:35Z',
  },
  {
    id: 3,
    name: 'Carla Dias',
    email: 'carla@example.com',
    avatar: 'https://lh3.googleusercontent.com/a/carla=s96-c',
    theme: 'GREEN',
    provider: 'google',
    providerId: '100000000000000000003',
    lastLoginAt: '2026-09-20T08:30:00Z',
    createdAt: '2018-03-11T11:06:03Z',
  },
];

function movie(id: number, fields: Partial<FixtureMovie> & Pick<FixtureMovie, 'originalTitle'>): FixtureMovie {
  const slug = fields.originalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    title: fields.originalTitle,
    year: '2010',
    slug,
    category: 'MOVIE',
    genre: 'Drama',
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
  // Three ratings: average VERY_GOOD, last UNMISSABLE (not the highest id), list order by id ≠ created_at order.
  movie(1, { title: 'Matrix', originalTitle: 'The Matrix', year: '1999', genre: 'Action,Science Fiction' }),
  // Two ratings with mean 2.5: PHP round() gives COOL (half away from zero); banker's rounding would give BAD.
  movie(2, { title: 'Ação em Dobro', originalTitle: 'Double Action', genre: 'Ação,Comédia' }),
  // A series.
  movie(3, { originalTitle: 'Snowpiercer', category: 'SERIE', year: '2020', genre: 'Drama,Sci-Fi & Fantasy' }),
  // No poster and no backdrop: null image URLs, never picked by /movies/random.
  movie(4, { originalTitle: 'No Images', posterPath: null, backdropPath: null }),
  // Only bad ratings: never picked by /movies/random.
  movie(5, { originalTitle: 'Stay Away From Me' }),
  // No year, no IMDb id.
  movie(6, { originalTitle: 'Unknown Year', year: null, imdbId: null }),
];

const FILLER_IDS = Array.from({ length: 24 }, (_, i) => i + 7);

// 30 movies with ratings → page 1 has 24, page 2 has 6.
// Movie 31 has no ratings: it's not in the list, and its details hit Q-17.
export const movies: FixtureMovie[] = [
  ...specialMovies,
  ...FILLER_IDS.map(id => movie(id, { originalTitle: `Filler Movie ${id}` })),
  movie(31, { originalTitle: 'Never Rated' }),
];

const FILLER_RATINGS: RatingKey[] = ['GOOD', 'VERY_GOOD', 'UNMISSABLE', 'COOL'];

// Ratings of the filler movies are older than the special ones, one day apart, so the list order is
// specials (by their latest rating) first, then fillers from the newest (id 30) to the oldest (id 7).
const fillerThreads: Omit<FixtureThread, 'id'>[] = FILLER_IDS.map((movieId, i) => ({
  userId: (i % users.length) + 1,
  movieId,
  rating: FILLER_RATINGS[i % FILLER_RATINGS.length] ?? 'GOOD',
  comment: null,
  createdAt: new Date(Date.UTC(2020, 0, 1 + i, 12)).toISOString().replace('.000Z', 'Z'),
}));

const specialThreads: Omit<FixtureThread, 'id'>[] = [
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

export const threads: FixtureThread[] = [...specialThreads, ...fillerThreads].map((t, i) => ({ id: i + 1, ...t }));
