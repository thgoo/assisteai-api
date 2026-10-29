import { pgTable, text } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';

/** JWT ids revoked by a refresh. Rows can be deleted once `expires_at` (the end of the refresh window) has passed. */
export const revokedTokens = pgTable('revoked_tokens', {
  jti: text('jti').primaryKey(),
  expiresAt: timestampTz('expires_at').notNull(),
});
