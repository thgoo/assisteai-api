import { defineConfig } from 'drizzle-kit';
import { loadDatabaseConfig } from '~/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: loadDatabaseConfig(),
  strict: true,
  verbose: true,
});
