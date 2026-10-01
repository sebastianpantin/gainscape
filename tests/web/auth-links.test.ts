import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, authCallbackUrl, authErrorMessage, parseAuthCallback } from '../../web/src/lib/auth-links.ts';

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

  it('passes any other message through', () => {
    expect(authErrorMessage({ code: 'weak_password', status: 422, message: 'Password is too weak' })).toBe(
      'Password is too weak',
    );
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe('Failed to fetch');
  });
});
