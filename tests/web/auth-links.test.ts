import { describe, expect, it } from 'vitest';
import {
  AUTH_MESSAGES,
  authCallbackUrl,
  authErrorMessage,
  confirmedRecently,
  emailChangeProblem,
  MINIMUM_PASSWORD_LENGTH,
  parseAuthCallback,
  passwordProblem,
  passwordResetProblem,
} from '../../web/src/lib/auth-links.ts';

describe('authCallbackUrl', () => {
  it('points at /auth/confirm on the given origin', () => {
    expect(authCallbackUrl('https://localhost:5173')).toBe('https://localhost:5173/auth/confirm');
    expect(authCallbackUrl('https://192.168.1.20:5173')).toBe('https://192.168.1.20:5173/auth/confirm');
  });
});

describe('parseAuthCallback', () => {
  it('reads the token hash and type on the callback path', () => {
    expect(parseAuthCallback('https://localhost:5173/auth/confirm?token_hash=abc123&type=email')).toEqual({
      tokenHash: 'abc123',
      type: 'email',
    });
  });

  it('reads them on any path, for the site_url fallback', () => {
    expect(parseAuthCallback('https://localhost:5173/?token_hash=xyz&type=recovery')).toEqual({
      tokenHash: 'xyz',
      type: 'recovery',
    });
    expect(parseAuthCallback('https://localhost:5173?token_hash=xyz&type=email_change')).toEqual({
      tokenHash: 'xyz',
      type: 'email_change',
    });
  });

  it('is null without a type, with an unknown type, or without a token hash', () => {
    expect(parseAuthCallback('https://localhost:5173/auth/confirm?token_hash=abc')).toBeNull();
    expect(parseAuthCallback('https://localhost:5173/auth/confirm?token_hash=abc&type=magiclink')).toBeNull();
    expect(parseAuthCallback('https://localhost:5173/auth/confirm?type=email')).toBeNull();
    expect(parseAuthCallback('https://localhost:5173/')).toBeNull();
    expect(parseAuthCallback('not a url')).toBeNull();
  });
});

describe('authErrorMessage', () => {
  it('maps the known auth errors', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' })).toBe(
      'Confirm your email first. We can send the link again.',
    );
    expect(authErrorMessage({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' })).toBe(
      'Wrong email or password.',
    );
    expect(
      authErrorMessage({ code: 'otp_expired', status: 403, message: 'Email link is invalid or has expired' }),
    ).toBe('This link is invalid or has expired.');
    expect(authErrorMessage({ status: 403, message: 'Forbidden' })).toBe(AUTH_MESSAGES.invalidLink);
    expect(
      authErrorMessage({ code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded' }),
    ).toBe('Too many emails. Try again in a minute.');
  });

  it('tells someone who tries to sign up that sign-up is invite-only', () => {
    expect(
      authErrorMessage({ code: 'signup_disabled', status: 422, message: 'Signups not allowed for this instance' }),
    ).toBe('Sign-up is invite-only. Ask the admin for an account.');
  });

  it('passes any other message through', () => {
    expect(authErrorMessage({ code: 'weak_password', status: 422, message: 'Password is too weak' })).toBe(
      'Password is too weak',
    );
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe('Failed to fetch');
  });
});

describe('confirmedRecently', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');

  it('is true within the hour after confirmation', () => {
    expect(confirmedRecently('2026-10-01T11:59:00Z', now)).toBe(true);
    expect(confirmedRecently('2026-10-01T11:00:01Z', now)).toBe(true);
  });

  it('is false once the hour is over, without a confirmation, or for a bad or future date', () => {
    expect(confirmedRecently('2026-10-01T11:00:00Z', now)).toBe(false);
    expect(confirmedRecently('2026-09-30T12:00:00Z', now)).toBe(false);
    expect(confirmedRecently(null, now)).toBe(false);
    expect(confirmedRecently(undefined, now)).toBe(false);
    expect(confirmedRecently('not a date', now)).toBe(false);
    expect(confirmedRecently('2026-10-01T12:05:00Z', now)).toBe(false);
  });
});

describe('passwordProblem', () => {
  it('asks for at least 12 characters', () => {
    expect(MINIMUM_PASSWORD_LENGTH).toBe(12);
    expect(passwordProblem('eleven-char')).toBe('Use at least 12 characters.');
    expect(passwordProblem('twelve-chars')).toBeNull();
  });

  it('accepts a long passphrase without digits or symbols', () => {
    expect(passwordProblem('correct horse battery staple')).toBeNull();
  });
});

describe('passwordResetProblem', () => {
  it('stays neutral when the reset was sent or the account does not exist', () => {
    expect(passwordResetProblem(null)).toBeNull();
    expect(passwordResetProblem({ message: 'User not found', code: 'user_not_found', status: 404 })).toBeNull();
  });

  it('shows the auth error for a rate limit or a network failure', () => {
    expect(
      passwordResetProblem({ message: 'Email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 }),
    ).toBe(AUTH_MESSAGES.tooManyEmails);
    expect(passwordResetProblem({ message: 'Failed to fetch', status: 0 })).toBe('Failed to fetch');
  });
});

describe('emailChangeProblem', () => {
  it('says the email could not be changed when the auth server fails or cannot be reached', () => {
    expect(emailChangeProblem({ message: 'Error sending email change email', status: 500 })).toBe(
      'Could not change your email.',
    );
    expect(emailChangeProblem({ message: 'Failed to fetch', status: 0 })).toBe('Could not change your email.');
    expect(emailChangeProblem({ message: 'Failed to fetch' })).toBe('Could not change your email.');
  });

  it('keeps the auth message for a request the server refused', () => {
    expect(
      emailChangeProblem({
        message: 'A user with this email address has already been registered',
        code: 'email_exists',
        status: 422,
      }),
    ).toBe('A user with this email address has already been registered');
    expect(
      emailChangeProblem({ message: 'Email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 }),
    ).toBe(AUTH_MESSAGES.tooManyEmails);
  });
});
