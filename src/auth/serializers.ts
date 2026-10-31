import type { User } from './user-repository';

/** The signed-in user's own profile (only ever sent to themselves). */
export function userResource(user: User) {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
}
