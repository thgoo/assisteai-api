import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { bigint, customType, timestamp } from 'drizzle-orm/pg-core';
import { textLiterals } from '~/db/sql';

/** Identity primary key. "By default" accepts explicit ids, so imported and seeded rows keep theirs. */
export const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity();

export const foreignId = (name: string) => bigint(name, { mode: 'number' }).notNull();

/** Whole seconds: nothing needs sub-second precision, and imported data has none. */
export const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date', precision: 0 });

export const timestamps = {
  createdAt: timestampTz('created_at').notNull().defaultNow(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
};

/** Case-insensitive text (the `citext` extension, created by the first migration). */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

/** `column IN ('a', 'b')` for check constraints. */
export function oneOf(column: AnyPgColumn, values: readonly string[]) {
  return sql`${column} IN (${textLiterals(values)})`;
}
