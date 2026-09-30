export const RATE_LIMITED_STATUS = 429;
export const RATE_LIMITED_CODE = 'rate_limited';

const SECONDS_PER_MINUTE = 60;

export function retryAfterSeconds(details: unknown): number | null {
  if (typeof details === 'string') {
    try {
      return retryAfterSeconds(JSON.parse(details));
    } catch {
      return null;
    }
  }
  if (typeof details !== 'object' || details === null) return null;
  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function minutesUntil(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE));
}

export function tryAgainIn(seconds: number | null): string {
  return seconds === null ? 'Try again in a few minutes.' : `Try again in ${minutesUntil(seconds)} min.`;
}
