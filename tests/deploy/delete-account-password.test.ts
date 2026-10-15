import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authServiceFailure,
  passwordMatchesAfterSignIn,
} from '../../supabase/functions/delete-account/password-check.ts';
import { HttpError } from '../../supabase/functions/_shared/http.ts';

function thrownBy(check: () => boolean): unknown {
  try {
    check();
  } catch (error) {
    return error;
  }
  return undefined;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('passwordMatchesAfterSignIn', () => {
  it('matches only a sign-in that returned a session', () => {
    expect(passwordMatchesAfterSignIn(null, true)).toBe(true);
    expect(passwordMatchesAfterSignIn(null, false)).toBe(false);
  });

  it('treats invalid credentials as a wrong password', () => {
    expect(passwordMatchesAfterSignIn({ status: 400, code: 'invalid_credentials' }, false)).toBe(false);
  });

  it('answers 429 when the auth server rate limits the check', () => {
    expect(thrownBy(() => passwordMatchesAfterSignIn({ status: 429, code: 'over_request_rate_limit' }, false))).toEqual(
      new HttpError(429, 'auth_rate_limited'),
    );
  });

  it.each([
    ['a server error', { status: 500, code: 'unexpected_failure' }],
    ['a network failure', { status: 0 }],
    ['an unknown client error', { status: 400, code: 'validation_failed' }],
  ])('answers 503 for %s instead of a wrong password and logs it', (_label, error) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const thrown = thrownBy(() => passwordMatchesAfterSignIn(error, false));
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({ status: 503, code: 'auth_unavailable' });
    expect(logged).toHaveBeenCalledWith(error);
  });
});

describe('authServiceFailure', () => {
  it.each([
    ['a server error', { status: 500, code: 'unexpected_failure' }],
    ['a network failure', { status: 0 }],
    ['a bad gateway', { status: 502 }],
  ])(
    'answers 503 auth_unavailable when the auth server fails to delete the user with %s and logs it',
    (_label, error) => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failure = authServiceFailure(error);
      expect(failure).toBeInstanceOf(HttpError);
      expect(failure).toMatchObject({ status: 503, code: 'auth_unavailable' });
      expect(logged).toHaveBeenCalledWith(error);
    },
  );
});
