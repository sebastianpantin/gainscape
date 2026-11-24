import { pgErrorCode, type sql, type Transaction } from './db.ts';
import { HttpError } from './http.ts';

type RateLimitBucket =
  | 'session_create_hour'
  | 'session_create_day'
  | 'session_edit_hour'
  | 'session_delete_hour'
  | 'export_data_hour'
  | 'delete_account_hour'
  | 'quest_start_hour'
  | 'garmin_import_day';

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
    if (isRateLimited(error)) throw new HttpError(429, RATE_LIMITED_CODE, JSON.parse(error.detail));
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new HttpError(404, 'profile_not_found');
    throw error;
  }
}

const RATE_LIMITED_CODE = 'rate_limited';

export async function rateLimitAllows(tx: Transaction, bucket: RateLimitBucket, userId: string): Promise<boolean> {
  try {
    await tx.savepoint((savepoint) => takeRateLimit(savepoint, bucket, userId));
    return true;
  } catch (error) {
    if (error instanceof HttpError && error.code === RATE_LIMITED_CODE) return false;
    throw error;
  }
}
