// The API tests are black-box: they talk HTTP to BASE_URL, stub external APIs through the mock (MOCK_URL) and reset
// the database with RESET_DB_COMMAND. They never import from src/.
import { z } from 'zod';

const env = z.object({
  BASE_URL: z.url().default('http://127.0.0.1:3000'),
  MOCK_URL: z.url().default('http://127.0.0.1:8080'),
  RESET_DB_COMMAND: z.string().default('bun run db:seed'),
}).parse(process.env);

export const baseUrl = env.BASE_URL;
export const mockUrl = env.MOCK_URL;
export const resetDbCommand = env.RESET_DB_COMMAND;
