import type { IssuedToken } from './token-service';
import type { User } from './user-repository';
import { laravelDate, saoPauloLocalDate } from '~/http/dates';

/**
 * `<User>`, only ever sent to the user themselves (login, `/auth/me`). `theme` is always present (Q-24);
 * `gender` is dropped (unused).
 */
export function userResource(user: User) {
  return {
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    theme: user.theme,
    last_login_at: user.lastLoginAt && saoPauloLocalDate(user.lastLoginAt),
    created_at: laravelDate(user.createdAt),
  };
}

export function tokenResource({ token, expiresInSeconds }: IssuedToken) {
  return { access_token: token, token_type: 'bearer', expires_in: expiresInSeconds };
}
