import { eq, lt } from 'drizzle-orm';
import type { Database } from '~/db/client';
import { revokedTokens } from '~/db/schema';

export interface RevokedTokens {
  isRevoked(jti: string): Promise<boolean>;
  /** Revokes `jti` until `expiresAt`. False when it was already revoked (e.g. two refreshes racing). */
  revoke(jti: string, expiresAt: Date): Promise<boolean>;
}

export class RevokedTokenRepository implements RevokedTokens {
  constructor(private readonly db: Database) {}

  async isRevoked(jti: string): Promise<boolean> {
    const rows = await this.db.select({ jti: revokedTokens.jti }).from(revokedTokens).where(eq(revokedTokens.jti, jti));
    return rows.length > 0;
  }

  async revoke(jti: string, expiresAt: Date): Promise<boolean> {
    return this.db.transaction(async tx => {
      // Past their refresh window these tokens are refused anyway, so the table stays small.
      await tx.delete(revokedTokens).where(lt(revokedTokens.expiresAt, new Date()));
      const inserted = await tx
        .insert(revokedTokens)
        .values({ jti, expiresAt })
        .onConflictDoNothing()
        .returning({ jti: revokedTokens.jti });
      return inserted.length > 0;
    });
  }
}
