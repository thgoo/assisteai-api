/** Whether `error` (or the driver error Drizzle wraps in `cause`) is a unique violation of `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const { code, constraint_name: name } = current as Error & { code?: string; constraint_name?: string };
    if (code === '23505' && name === constraint) return true;
  }
  return false;
}
