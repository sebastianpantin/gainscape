export type AuthCallbackType = 'email' | 'recovery' | 'email_change';

export interface AuthCallback {
  tokenHash: string;
  type: AuthCallbackType;
}

export interface AuthErrorLike {
  code?: string;
  status?: number;
  message: string;
}

const CALLBACK_TYPES: readonly string[] = ['email', 'recovery', 'email_change'];
const FORBIDDEN_STATUS = 403;

export const RESEND_COOLDOWN_SECONDS = 60;
const USERNAME_CHANGE_WINDOW_MS = 60 * 60 * 1000;

export const AUTH_MESSAGES = {
  emailNotConfirmed: 'Confirm your email first. We can send the link again.',
  invalidCredentials: 'Wrong email or password.',
  invalidLink: 'This link is invalid or has expired.',
  tooManyEmails: 'Too many emails. Try again in a minute.',
  inviteOnly: 'Sign-up is invite-only. Ask the admin for an account.',
} as const;

export const MINIMUM_PASSWORD_LENGTH = 12;

export function passwordProblem(password: string): string | null {
  return password.length < MINIMUM_PASSWORD_LENGTH ? `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.` : null;
}

export function authCallbackUrl(origin: string): string {
  return `${origin}/auth/confirm`;
}

export function parseAuthCallback(url: string): AuthCallback | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (!tokenHash || !type || !CALLBACK_TYPES.includes(type)) return null;
  return { tokenHash, type: type as AuthCallbackType };
}

export function authErrorMessage(error: AuthErrorLike): string {
  if (error.code === 'email_not_confirmed') return AUTH_MESSAGES.emailNotConfirmed;
  if (error.code === 'invalid_credentials') return AUTH_MESSAGES.invalidCredentials;
  if (error.code === 'otp_expired' || error.status === FORBIDDEN_STATUS) return AUTH_MESSAGES.invalidLink;
  if (error.code === 'over_email_send_rate_limit') return AUTH_MESSAGES.tooManyEmails;
  if (error.code === 'signup_disabled') return AUTH_MESSAGES.inviteOnly;
  return error.message;
}

const SERVER_ERROR_STATUS = 500;

export function emailChangeProblem(error: AuthErrorLike): string {
  if (!error.status || error.status >= SERVER_ERROR_STATUS) return 'Could not change your email.';
  if (error.code === 'over_email_send_rate_limit') return AUTH_MESSAGES.tooManyEmails;
  return error.message;
}

export function passwordResetProblem(error: AuthErrorLike | null): string | null {
  if (!error || error.code === 'user_not_found') return null;
  return authErrorMessage(error);
}

export function confirmedRecently(emailConfirmedAt: string | null | undefined, now = Date.now()): boolean {
  if (!emailConfirmedAt) return false;
  const confirmedAt = Date.parse(emailConfirmedAt);
  return Number.isFinite(confirmedAt) && confirmedAt <= now && now - confirmedAt < USERNAME_CHANGE_WINDOW_MS;
}

export const USERNAME_PATTERN = '^[a-z0-9_]{3,20}$';
export const USERNAME_HINT = '3–20 characters: lowercase letters, digits, underscore';
