export const RATE_LIMITED_STATUS = 429;
export const RATE_LIMITED_CODE = 'rate_limited';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const LONGEST_WAIT_IN_MINUTES = 90;

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

export function waitText(seconds: number): string {
  const minutes = minutesUntil(seconds);
  if (minutes <= LONGEST_WAIT_IN_MINUTES) return `${minutes} min`;
  const hours = Math.ceil(seconds / SECONDS_PER_HOUR);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

const DATABASE_RATE_LIMITED_CODE = 'PT429';

export function rateLimitedMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, details } = error as { code?: unknown; details?: unknown };
  if (code !== DATABASE_RATE_LIMITED_CODE) return null;
  return `Too many changes in a short time. ${tryAgainIn(retryAfterSeconds(details))}`;
}

export function withFriendlyRateLimit<E>(error: E): E | Error {
  const message = rateLimitedMessage(error);
  return message === null ? error : new Error(message);
}

export function tryAgainIn(seconds: number | null): string {
  return seconds === null ? 'Try again in a few minutes.' : `Try again in ${waitText(seconds)}.`;
}
