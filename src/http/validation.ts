import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { ProblemError } from './errors';

/**
 * Validates a request part with zod. Failures are a 422 problem: `detail` is the first issue's message (the frontend
 * shows it), `errors` lists every issue.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, result => {
    if (result.success) return;
    const errors = result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
    throw new ProblemError(422, errors[0]?.message, errors);
  });
}
