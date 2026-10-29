import type { AppDependencies } from '~/app';

/** App collaborators a unit test doesn't exercise. Calling one fails the test loudly. */
export const unusedServices = new Proxy({}, {
  get: (_, name) => new Proxy({}, {
    get: (__, method) => () => {
      throw new Error(`Unexpected call: ${String(name)}.${String(method)}()`);
    },
  }),
}) as Pick<AppDependencies, 'googleClient' | 'movieService' | 'tokenService' | 'userRepository'>;
