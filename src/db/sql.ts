import { sql } from 'drizzle-orm';

/**
 * `'a', 'b'` as raw SQL, for places that can't take bind parameters (check constraints) or where an inline constant
 * reads better. Only for code constants: values are quoted, not escaped.
 */
export function textLiterals(values: readonly string[]) {
  return sql.raw(values.map(value => `'${value}'`).join(', '));
}
