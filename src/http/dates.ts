/** Laravel's default date serialization: UTC ISO 8601 with microseconds, e.g. `2026-08-01T10:00:00.000000Z`. */
export function laravelDate(date: Date): string {
  return date.toISOString().replace(/Z$/, '000Z');
}
