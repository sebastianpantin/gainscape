import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../supabase/functions/_shared/http.ts';
import { tokenCheckFailure } from '../../supabase/functions/_shared/token-check.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tokenCheckFailure', () => {
  it.each([
    ['a malformed or badly signed JWT', { status: 400 }],
    ['a token the auth server rejects', { status: 401 }],
    ['a user the auth server no longer knows', { status: 403 }],
  ])('answers 401 invalid_token for %s', (_label, error) => {
    expect(tokenCheckFailure(error)).toEqual(new HttpError(401, 'invalid_token'));
  });

  it.each([
    ['a rate limit', { status: 429 }],
    ['a server error', { status: 500 }],
    ['a bad gateway', { status: 502 }],
    ['a network failure', { status: 0 }],
    ['an error without a status', {}],
  ])('answers 503 auth_unavailable for %s and logs it', (_label, error) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = tokenCheckFailure(error);
    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toMatchObject({ status: 503, code: 'auth_unavailable' });
    expect(logged).toHaveBeenCalledWith(error);
  });
});
