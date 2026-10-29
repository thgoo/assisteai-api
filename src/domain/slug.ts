/** URL slug of a title: `Amélie (2001)!` → `amelie-2001`. Empty when nothing usable is left (e.g. only CJK). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
