import postgres from 'npm:postgres@3.4.9';

export const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });

export type Transaction = postgres.TransactionSql;

export type JsonValue = postgres.JSONValue;

export function pgErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
}
