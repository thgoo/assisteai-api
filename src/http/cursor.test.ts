import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { cursorParam, encodeCursor } from './cursor';

const keySchema = z.object({ at: z.iso.datetime(), id: z.number().int() });

describe('cursors', () => {
  test('round-trip', () => {
    const key = { at: '2026-10-29T13:34:12.000Z', id: 7 };
    expect(cursorParam(keySchema).parse(encodeCursor(key))).toEqual(key);
  });

  test.each(['not base64 json', encodeCursor({ at: 'yesterday', id: 7 }), encodeCursor([1, 2])])(
    'rejects %p',
    value => {
      expect(cursorParam(keySchema).safeParse(value).error?.issues[0]?.message).toBe('Cursor inválido.');
    },
  );
});
