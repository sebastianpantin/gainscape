import { pgErrorCode, type sql, type Transaction } from './db.ts';
import { HttpError } from './http.ts';

type RateLimitBucket =
  | 'session_create_hour'
  | 'session_create_day'
  | 'session_edit_hour'
  | 'session_delete_hour'
  | 'export_data_hour'
  | 'delete_account_hour'
  | 'quest_start_hour';

const RATE_LIMITED = 'PT429';
const FOREIGN_KEY_VIOLATION = '23503';

function isRateLimited(error: unknown): error is { detail: string } {
  return pgErrorCode(error) === RATE_LIMITED && typeof (error as { detail?: unknown }).detail === 'string';
}

export async function takeRateLimit(
  runner: Transaction | typeof sql,
  bucket: RateLimitBucket,
  userId: string,
): Promise<void> {
  try {
    await runner`select private.take_rate_limit(${bucket}, ${userId})`;
  } catch (error) {
    if (isRateLimited(error)) throw new HttpError(429, 'rate_limited', JSON.parse(error.detail));
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new HttpError(404, 'profile_not_found');
    throw error;
  }
}
