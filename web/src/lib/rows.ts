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

export function columnsOf<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  embedded: Partial<Record<keyof Shape & string, string>> = {},
): string {
  return Object.keys(schema.shape)
    .map((column) => {
      const inner = embedded[column as keyof Shape & string];
      return inner === undefined ? column : `${column}(${inner})`;
    })
    .join(',');
}

type RowSchemas = Record<string, z.ZodObject>;

export function columnsOfEach<Schemas extends RowSchemas>(schemas: Schemas): { [Table in keyof Schemas]: string } {
  return Object.fromEntries(Object.entries(schemas).map(([table, schema]) => [table, columnsOf(schema)])) as {
    [Table in keyof Schemas]: string;
  };
}

export function rowListsSchema<Schemas extends RowSchemas>(schemas: Schemas) {
  return z.object(
    Object.fromEntries(Object.entries(schemas).map(([table, schema]) => [table, z.array(schema)])) as {
      [Table in keyof Schemas]: z.ZodArray<Schemas[Table]>;
    },
  );
}
