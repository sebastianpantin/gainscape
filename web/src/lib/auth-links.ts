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

export const AUTH_MESSAGES = {
  emailNotConfirmed: 'Confirm your email first. We can send the link again.',
  invalidCredentials: 'Wrong email or password.',
  invalidLink: 'This link is invalid or has expired.',
  tooManyEmails: 'Too many emails. Try again in a minute.',
} as const;

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
  return error.message;
}
