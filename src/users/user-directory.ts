import { count, eq } from 'drizzle-orm';
import type { Database } from '~/db/client';
import { ratings, users } from '~/db/schema';
import { byName } from '~/db/sql';

/** A user's public profile, as movie pages already show it. */
export interface Rater {
  id: number;
  name: string;
  avatarUrl: string | null;
  ratingCount: number;
}

/** Public listing of the people who rate movies. */
export class UserDirectory {
  constructor(private readonly db: Database) {}

  /** Users with at least one rating, by name. */
  async listRaters(): Promise<Rater[]> {
    return this.db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, ratingCount: count(ratings.id) })
      .from(users)
      .innerJoin(ratings, eq(ratings.userId, users.id))
      .groupBy(users.id)
      .orderBy(...byName(users.name), users.id);
  }
}
