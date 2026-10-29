import type { AppDependencies } from '~/app';

/** App collaborators a unit test doesn't exercise. Calling one fails the test loudly. */
export const unusedServices = new Proxy({}, {
  get: (_, name) => new Proxy({}, {
    get: (__, method) => () => {
      throw new Error(`Unexpected call: ${String(name)}.${String(method)}()`);
    },
  }),
}) as Omit<
  AppDependencies,
  'corsOrigins' | 'logger' | 'checkHealth' | 'ratingsPerMinute' | 'signInsPerMinute' | 'searchesPerMinute'
>;

/** Limits and checks for unit tests that don't exercise them. */
export const testSettings = {
  ratingsPerMinute: 1000,
  signInsPerMinute: 1000,
  searchesPerMinute: 1000,
  checkHealth: () => Promise.resolve(),
};
