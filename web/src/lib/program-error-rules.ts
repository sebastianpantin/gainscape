import { DATABASE_RATE_LIMITED_CODE, RATE_LIMITED_CODE } from './rate-limit.ts';

export const PROGRAM_OFFLINE_TEXT = "You're offline. Starting or editing a program needs a connection.";

const GENERIC_TEXT = 'Something went wrong. Try again.';
const CONNECTION_TEXT = "Couldn't reach the server. Check your connection.";
const RATE_LIMITED_TEXT = 'Too many changes, try again later';
const SIGN_IN_TEXT = 'Sign in again to change your program.';
const STOPPED_ELSEWHERE_TEXT = 'This program was stopped on another device.';

const RATE_LIMITED_CODES: readonly string[] = [DATABASE_RATE_LIMITED_CODE, RATE_LIMITED_CODE];
const NOT_AUTHENTICATED_CODE = '42501';
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed|AbortError|TimeoutError/i;

const DATABASE_ERROR_TEXT: Readonly<Record<string, string>> = {
  invalid_enrollment: "These numbers can't start the program. Check them and try again.",
  unknown_template: 'This program is no longer available.',
  unknown_exercise: 'One of the chosen exercises is no longer available. Pick another one.',
  enrollment_ended: STOPPED_ELSEWHERE_TEXT,
  enrollment_not_found: STOPPED_ELSEWHERE_TEXT,
  invalid_event: "That change can't be saved. Check the numbers and try again.",
  not_authenticated: SIGN_IN_TEXT,
};

export function programErrorText(error: unknown): string {
  if (typeof error !== 'object' || error === null) return GENERIC_TEXT;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && RATE_LIMITED_CODES.includes(code)) return RATE_LIMITED_TEXT;
  if (code === NOT_AUTHENTICATED_CODE) return SIGN_IN_TEXT;
  if (typeof message !== 'string') return GENERIC_TEXT;
  if (Object.hasOwn(DATABASE_ERROR_TEXT, message)) return DATABASE_ERROR_TEXT[message];
  return NETWORK_FAILURE.test(message) ? CONNECTION_TEXT : GENERIC_TEXT;
}
