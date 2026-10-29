import { eq, sql } from 'drizzle-orm';
import type { GoogleIdentity } from './google-id-token-verifier';
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
   * The user of a Google account, found by `sub`, else by email (accounts from before Google sign-in), else created.
   * Name, avatar and last login are refreshed on every sign-in.
   */
  async upsertFromGoogle(identity: GoogleIdentity): Promise<User> {
    const profile = { name: identity.name, avatarUrl: identity.avatarUrl, lastLoginAt: new Date() };

    const [bySub] = await this.db.update(users).set(profile).where(eq(users.googleSub, identity.sub)).returning();
    if (bySub) return bySub;

    // Google only issues ID tokens with `email_verified` for addresses it verified, so the email owner gets linked.
    const [user] = await this.db
      .insert(users)
      .values({ ...profile, email: identity.email, googleSub: identity.sub })
      .onConflictDoUpdate({ target: users.email, set: { ...profile, googleSub: sql`excluded.google_sub` } })
      .returning();
    if (!user) throw new Error('Upsert returned no user');
    return user;
  }
}
