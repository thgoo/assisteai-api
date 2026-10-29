import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { foreignId, timestampTz } from './columns';
import { users } from './users';

/** Signed-in sessions. Only the SHA-256 of the session token is stored, so a database leak can't sign anyone in. */
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: foreignId('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  lastUsedAt: timestampTz('last_used_at').notNull().defaultNow(),
  expiresAt: timestampTz('expires_at').notNull(),
}, table => [
  index('sessions_user_id_idx').on(table.userId),
]);
