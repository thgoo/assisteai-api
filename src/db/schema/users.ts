import { pgTable, text } from 'drizzle-orm/pg-core';
import { citext, id, timestamps, timestampTz } from './columns';

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  email: citext('email').notNull().unique(),
  /** Google's `sub`. Null for users who never signed in with Google; they get linked by email on first login. */
  googleSub: text('google_sub').unique(),
  avatar: text('avatar'),
  theme: text('theme'),
  lastLoginAt: timestampTz('last_login_at'),
  ...timestamps,
});
