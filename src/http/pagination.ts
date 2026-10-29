// Laravel's LengthAwarePaginator JSON, which legacy list endpoints return. The frontend only reads `data` and
// `next_page_url`; the rest is kept because it's cheap. `links` (localized page buttons) is dropped (Q-27).
import { z } from 'zod';

export interface PageRequest {
  page: number;
  perPage: number;
}

export interface LengthAwarePage<T> {
  current_page: number;
  data: T[];
  first_page_url: string;
  from: number | null;
  last_page: number;
  last_page_url: string;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
}

/** Like Laravel, anything that isn't an integer ≥ 1 means page 1. The bound keeps the offset a safe integer. */
export function pageParam(perPage: number) {
  return z.coerce.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER / perPage)).catch(1);
}

export function offsetOf({ page, perPage }: PageRequest): number {
  return (page - 1) * perPage;
}

/** `requestUrl` gives the links' origin and path; other query parameters are not carried over (same as legacy). */
export function lengthAwarePage<T>(
  { items, total }: { items: T[]; total: number },
  { page, perPage }: PageRequest,
  requestUrl: string,
): LengthAwarePage<T> {
  const { origin, pathname } = new URL(requestUrl);
  const path = origin + pathname;
  const urlOf = (target: number) => `${path}?page=${target}`;
  const lastPage = Math.max(Math.ceil(total / perPage), 1);
  const from = offsetOf({ page, perPage }) + 1;

  return {
    current_page: page,
    data: items,
    first_page_url: urlOf(1),
    from: items.length === 0 ? null : from,
    last_page: lastPage,
    last_page_url: urlOf(lastPage),
    next_page_url: page < lastPage ? urlOf(page + 1) : null,
    path,
    per_page: perPage,
    prev_page_url: page > 1 ? urlOf(page - 1) : null,
    to: items.length === 0 ? null : from + items.length - 1,
    total,
  };
}
