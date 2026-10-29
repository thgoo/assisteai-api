import { z } from 'zod';

/** Opaque pagination cursors: base64url JSON of the last item's sort key. Clients pass them back untouched. */
export function encodeCursor(key: unknown): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

/** A query parameter schema that decodes a cursor into `keySchema`, or fails validation. */
export function cursorParam<Key extends z.ZodType>(keySchema: Key) {
  return z.string().transform((value, ctx): z.output<Key> => {
    try {
      const parsed = keySchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
      if (parsed.success) return parsed.data;
    } catch {
      // Falls through to the issue below.
    }
    ctx.addIssue({ code: 'custom', message: 'Cursor inválido.' });
    return z.NEVER;
  });
}
