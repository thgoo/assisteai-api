import { Hono } from 'hono';
import type { UserDirectory } from './user-directory';

export function createUserRoutes({ userDirectory }: { userDirectory: UserDirectory }) {
  return new Hono()
    .get('/', async c => c.json({ data: await userDirectory.listRaters() }));
}
