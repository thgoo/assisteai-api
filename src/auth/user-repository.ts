import { eq, sql } from 'drizzle-orm';
import type { GoogleUser } from './google-client';
import type { Database } from '~/db/client';
import { users } from '~/db/schema';

export type User = typeof users.$inferSelect;

export class UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: number): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  /**
   * Finds the user of a Google account (by `sub`, then by email for users from before Google login or from the
   * Facebook era), refreshing their name, avatar and last login, or creates one.
   */
  async upsertFromGoogle(google: GoogleUser): Promise<User> {
    const profile = { name: google.name, avatar: google.picture ?? null, lastLoginAt: new Date() };

    const [bySub] = await this.db.update(users).set(profile).where(eq(users.googleSub, google.sub)).returning();
    if (bySub) return bySub;

    // Google emails are verified, so the account that owns the email gets linked to this Google account.
    const [user] = await this.db
      .insert(users)
      .values({ ...profile, email: google.email, googleSub: google.sub })
      .onConflictDoUpdate({
        target: users.email,
        set: { ...profile, googleSub: sql`excluded.google_sub` },
      })
      .returning();
    if (!user) throw new Error('Upsert returned no user');
    return user;
  }
}
