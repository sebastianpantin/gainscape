const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type ImplausibleTiming = 'ends_before_start' | 'session_too_long' | 'session_in_future';

export function implausibleTiming(startedAt: string, endedAt: string, now: number): ImplausibleTiming | null {
  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  const latestAllowed = now + ALLOWED_CLOCK_SKEW_MS;
  if (ended < started) return 'ends_before_start';
  if (ended - started > MAX_SESSION_DURATION_MS) return 'session_too_long';
  if (started > latestAllowed || ended > latestAllowed) return 'session_in_future';
  return null;
}
