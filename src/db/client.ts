import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>['db'];

/** Sessions run in UTC, so `timestamptz` values never depend on the server's time zone. */
export function createDatabase(url: string) {
  const client = postgres(url, { connection: { TimeZone: 'UTC' } });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
