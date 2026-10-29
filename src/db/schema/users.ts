import { pgTable, text } from 'drizzle-orm/pg-core';
import { citext, id, timestamps, timestampTz } from './columns';

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  email: citext('email').notNull().unique(),
  /** Google's `sub`. Null until the user's first Google sign-in, which links the account by email. */
  googleSub: text('google_sub').unique(),
  avatarUrl: text('avatar_url'),
  /** A profile preference kept from the old app; not exposed yet. */
  theme: text('theme'),
  lastLoginAt: timestampTz('last_login_at'),
  ...timestamps,
});
