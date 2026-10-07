import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishableKey, secretKey } from '../../supabase/functions/_shared/api-keys.ts';
import { HttpError } from '../../supabase/functions/_shared/http.ts';
import { assertSecretKey } from '../../supabase/functions/_shared/service-auth.ts';

declare global {
  var Deno: { env: { get(name: string): string | undefined } };
}

const secret = ['sb', 'secret', 's'.repeat(32)].join('_');
const publishable = ['sb', 'publishable', 'p'.repeat(32)].join('_');
const otherSecret = ['sb', 'secret', 't'.repeat(32)].join('_');

function withEnvironment(variables: Record<string, string>): void {
  vi.stubGlobal('Deno', { env: { get: (name: string) => variables[name] } });
}

function thrownBy(read: () => string): unknown {
  try {
    read();
  } catch (error) {
    return error;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Edge Function API keys', () => {
  it('reads the default key of each kind from the injected JSON maps', () => {
    withEnvironment({
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: secret, other: 'sb_secret_other' }),
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: publishable }),
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role-jwt',
      SUPABASE_ANON_KEY: 'legacy-anon-jwt',
    });
    expect(secretKey()).toBe(secret);
    expect(publishableKey()).toBe(publishable);
  });

  it.each([
    ['missing', {}],
    ['not JSON', { SUPABASE_SECRET_KEYS: secret }],
    ['without a default key', { SUPABASE_SECRET_KEYS: JSON.stringify({ other: secret }) }],
    ['a map whose default is not a secret key', { SUPABASE_SECRET_KEYS: JSON.stringify({ default: publishable }) }],
    ['not a map', { SUPABASE_SECRET_KEYS: JSON.stringify([secret]) }],
    ['a bare prefix', { SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_' }) }],
    ['a truncated key', { SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_abc' }) }],
    ['a key with a trailing space', { SUPABASE_SECRET_KEYS: JSON.stringify({ default: `${secret} ` }) }],
  ])('fails closed with 500 api_key_missing when the secret keys are %s', (_case, variables) => {
    withEnvironment(variables);
    const thrown = thrownBy(secretKey);
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({ status: 500, code: 'api_key_missing' });
  });

  it('never puts the raw variable in the error', () => {
    withEnvironment({ SUPABASE_SECRET_KEYS: `{${secret}` });
    const thrown = thrownBy(secretKey);
    expect(JSON.stringify(thrown)).not.toContain(secret);
    expect(String(thrown)).not.toContain(secret);
  });

  it.each([
    ['a secret key', secret],
    ['a bare prefix', 'sb_publishable_'],
  ])('refuses %s in the publishable map', (_case, value) => {
    withEnvironment({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: value }) });
    expect(thrownBy(publishableKey)).toMatchObject({ status: 500, code: 'api_key_missing' });
  });
});

describe('assertSecretKey', () => {
  function request(headers: Record<string, string>): Request {
    return new Request('http://functions.test/rebuild-caches', { method: 'POST', headers });
  }

  async function refusal(headers: Record<string, string>): Promise<unknown> {
    return await assertSecretKey(request(headers)).then(
      () => undefined,
      (error: unknown) => error,
    );
  }

  function withSecretKeys(): void {
    withEnvironment({
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: secret, other: otherSecret }),
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: publishable }),
    });
  }

  it('accepts the default secret key in the apikey header', async () => {
    withSecretKeys();
    expect(await refusal({ apikey: secret })).toBeUndefined();
  });

  it.each([
    ['no key', {}],
    ['the publishable key', { apikey: publishable }],
    ['a secret key as a bearer token instead of apikey', { Authorization: `Bearer ${secret}` }],
    ['a near miss', { apikey: `${secret}x` }],
    ['a secret key other than the default one', { apikey: otherSecret }],
  ])('refuses %s with 403 secret_key_required', async (_case, headers) => {
    withSecretKeys();
    expect(await refusal(headers)).toMatchObject({ status: 403, code: 'secret_key_required' });
  });

  it('fails closed with 500 api_key_missing when the project has no default secret key', async () => {
    withEnvironment({});
    expect(await refusal({ apikey: secret })).toMatchObject({ status: 500, code: 'api_key_missing' });
  });
});
