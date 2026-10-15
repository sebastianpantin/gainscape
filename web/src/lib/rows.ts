import { z } from 'zod';

export const UNREADABLE_ROWS_TEXT = 'The server sent data this version of the app cannot read. Reload to update.';

export const numericColumn = z.union([z.number(), z.string()]);

export function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

export function parsedRows<Row>(schema: z.ZodType<Row>, data: unknown): Row[] {
  const parsed = z.array(schema).safeParse(data);
  if (!parsed.success) throw new Error(UNREADABLE_ROWS_TEXT);
  return parsed.data;
}

export function parsedRow<Row>(schema: z.ZodType<Row>, data: unknown): Row {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(UNREADABLE_ROWS_TEXT);
  return parsed.data;
}
