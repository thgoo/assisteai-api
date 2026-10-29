import { and, eq, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '~/db/client';
import { sessions } from '~/db/schema';

export interface SessionServiceOptions {
  /** A session ends after this long without use. */
  idleTimeoutMs: number;
  now?: () => Date;
}

export interface NewSession {
  token: string;
  expiresAt: Date;
}

/** Don't write on every request: extend a session at most once per this interval. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Opaque session tokens. Only their SHA-256 is stored, so a leaked database can't be used to sign in. */
export class SessionService {
  private readonly now: () => Date;

  constructor(private readonly db: Database, private readonly options: SessionServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async create(userId: number): Promise<NewSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.expiry();
    await this.db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
    return { token, expiresAt };
  }

  /** The user of a live session (extending it), or `undefined`. */
  async authenticate(token: string): Promise<number | undefined> {
    const now = this.now();
    const [session] = await this.db
      .select({ userId: sessions.userId, lastUsedAt: sessions.lastUsedAt })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)));
    if (!session) return undefined;

    if (now.getTime() - session.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS) {
      await this.db
        .update(sessions)
        .set({ lastUsedAt: now, expiresAt: this.expiry() })
        .where(eq(sessions.tokenHash, hashToken(token)));
    }
    return session.userId;
  }

  async revoke(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  private expiry(): Date {
    return new Date(this.now().getTime() + this.options.idleTimeoutMs);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
