import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../supabase/functions/_shared/http.ts';
import { lootSecret } from '../../supabase/functions/_shared/loot-seeds.ts';

declare global {
  var Deno: { env: { get(name: string): string | undefined } };
}

function withLootSecret(value: string | undefined): void {
  vi.stubGlobal('Deno', { env: { get: (name: string) => (name === 'LOOT_SECRET' ? value : undefined) } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lootSecret', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['shorter than 32 characters', 'x'.repeat(31)],
  ])('fails closed with 500 loot_secret_missing when the secret is %s', (_case, value) => {
    withLootSecret(value);
    let thrown: unknown;
    try {
      lootSecret();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({ status: 500, code: 'loot_secret_missing' });
  });

  it('returns a secret of at least 32 characters as it is', () => {
    withLootSecret('s'.repeat(32));
    expect(lootSecret()).toBe('s'.repeat(32));
  });
});
