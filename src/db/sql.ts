import type { SQL, SQLWrapper } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * `'a', 'b'` as raw SQL, for places that can't take bind parameters (check constraints) or where an inline constant
 * reads better. Only for code constants: values are quoted, not escaped.
 */
export function textLiterals(values: readonly string[]) {
  return sql.raw(values.map(value => `'${value}'`).join(', '));
}

/** Alphabetical order regardless of case and accents, the same on every server (byte order, not the locale's). */
export function byName(name: SQLWrapper): SQL[] {
  return [sql`lower(unaccent(${name})) COLLATE "C"`, sql`${name} COLLATE "C"`];
}
