/** Laravel's default date serialization: UTC ISO 8601 with microseconds, e.g. `2026-08-01T10:00:00.000000Z`. */
export function laravelDate(date: Date): string {
  return date.toISOString().replace(/Z$/, '000Z');
}

const SAO_PAULO = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** `Y-m-d H:i:s` in São Paulo time: how legacy serializes `users.last_login_at`, which it doesn't cast (doc 01 §6). */
export function saoPauloLocalDate(date: Date): string {
  return SAO_PAULO.format(date);
}
