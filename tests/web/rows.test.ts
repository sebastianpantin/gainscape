import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  columnsOf,
  columnsOfEach,
  nullableNumber,
  numericColumn,
  parsedRow,
  parsedRows,
  rowListsSchema,
  UNREADABLE_ROWS_TEXT,
} from '../../web/src/lib/rows.ts';

describe('nullableNumber', () => {
  it('keeps null and turns numeric strings from Postgres into numbers', () => {
    expect(nullableNumber(null)).toBeNull();
    expect(nullableNumber('72.5')).toBe(72.5);
    expect(nullableNumber(3)).toBe(3);
  });
});

const rowSchema = z.object({ id: z.string(), weight_kg: numericColumn });

describe('parsedRows', () => {
  it('returns the rows when every row matches the schema, numerics as strings included', () => {
    const rows = [
      { id: 'a', weight_kg: '72.5' },
      { id: 'b', weight_kg: 80 },
    ];
    expect(parsedRows(rowSchema, rows)).toEqual(rows);
  });

  it('fails with a sentence for the user when one row does not match', () => {
    expect(() => parsedRows(rowSchema, [{ id: 'a', weight_kg: 80 }, { id: 'b' }])).toThrow(UNREADABLE_ROWS_TEXT);
  });

  it('fails the same way when the answer is not a list at all', () => {
    expect(() => parsedRows(rowSchema, null)).toThrow(UNREADABLE_ROWS_TEXT);
    expect(() => parsedRows(rowSchema, { id: 'a', weight_kg: 80 })).toThrow(UNREADABLE_ROWS_TEXT);
  });
});

describe('parsedRow', () => {
  it('returns a single matching row', () => {
    expect(parsedRow(rowSchema, { id: 'a', weight_kg: 1 })).toEqual({ id: 'a', weight_kg: 1 });
  });

  it('fails with a sentence for the user on a malformed row', () => {
    expect(() => parsedRow(rowSchema, { id: 7, weight_kg: 1 })).toThrow(UNREADABLE_ROWS_TEXT);
  });
});

describe('columnsOf', () => {
  it('selects every column the row schema reads, in schema order', () => {
    expect(columnsOf(rowSchema)).toBe('id,weight_kg');
  });

  it('selects an embedded table through the columns given for it', () => {
    const goalSchema = z.object({ reps: z.number(), exercises: z.object({ name: z.string() }) });
    expect(columnsOf(goalSchema, { exercises: columnsOf(z.object({ name: z.string() })) })).toBe(
      'reps,exercises(name)',
    );
  });
});

describe('row groups', () => {
  const schemas = { pins: z.object({ exercise_id: z.string(), position: z.number() }), goals: rowSchema };

  it('names the columns of each table in a group', () => {
    expect(columnsOfEach(schemas)).toEqual({ pins: 'exercise_id,position', goals: 'id,weight_kg' });
  });

  it('reads a list of rows for each table in a group', () => {
    const rows = { pins: [{ exercise_id: 'a', position: 1 }], goals: [{ id: 'b', weight_kg: '80' }] };
    expect(rowListsSchema(schemas).parse(rows)).toEqual(rows);
    expect(rowListsSchema(schemas).safeParse({ pins: [], goals: [{ id: 'b' }] }).success).toBe(false);
  });
});
