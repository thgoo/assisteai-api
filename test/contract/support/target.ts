// The contract suite is black-box: it talks HTTP to BASE_URL, plus the external API mock (MOCK_URL) and a
// target-specific database reset (RESET_DB_COMMAND). TARGET says which implementation is behind BASE_URL, so tests
// can encode the deliberate deviations of the new app (doc 01 §9 FIX items) next to the legacy behavior.
// JWT_SECRET is shared with the target so tests can mint tokens the way the other implementation would
// (rollback safety).
import { z } from 'zod';

const env = z.object({
  BASE_URL: z.url().default('http://127.0.0.1:8000'),
  MOCK_URL: z.url().default('http://127.0.0.1:8080'),
  TARGET: z.enum(['legacy', 'new']).default('legacy'),
  JWT_SECRET: z.string().min(32).default('local-legacy-env-jwt-secret-must-be-at-least-256-bits-long-0123456789'),
  RESET_DB_COMMAND: z.string().default('sh test/legacy-env/reset-db.sh'),
  /** With TARGET=new: where the legacy app runs, to check tokens across both apps (rollback safety). */
  LEGACY_BASE_URL: z.url().optional(),
  LEGACY_RESET_DB_COMMAND: z.string().default('sh test/legacy-env/reset-db.sh'),
}).parse(process.env);

export type Target = typeof env.TARGET;

export const baseUrl = env.BASE_URL;
export const mockUrl = env.MOCK_URL;
export const target: Target = env.TARGET;
export const jwtSecret = env.JWT_SECRET;
export const resetDbCommand = env.RESET_DB_COMMAND;
export const legacyBaseUrl = env.LEGACY_BASE_URL;
export const legacyResetDbCommand = env.LEGACY_RESET_DB_COMMAND;

/** Picks the expectation for the current target. Every call site documents the quirk (Q-xx) it encodes. */
export function byTarget<T>(expectations: Record<Target, T>): T {
  return expectations[target];
}
