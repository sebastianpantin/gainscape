import { describe, expect, it, vi } from 'vitest';

vi.mock('../../web/src/lib/platform/supabase.ts', () => ({ supabase: {} }));

const { lastLoggedWeightsQuery } = await import('../../web/src/lib/query/queries.ts');

describe('lastLoggedWeightsQuery', () => {
  it('keys the same exercises the same way whatever order they come in', () => {
    expect(lastLoggedWeightsQuery(['squat', 'bench', 'deadlift']).queryKey).toEqual(
      lastLoggedWeightsQuery(['deadlift', 'squat', 'bench']).queryKey,
    );
  });
});
