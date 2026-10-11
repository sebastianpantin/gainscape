import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { LiftExercise } from '../../web/src/lib/catalog-rules.ts';
import type { Collection } from '../../web/src/lib/collection-data.ts';

vi.mock('../../web/src/lib/supabase.ts', () => ({ supabase: {} }));

const {
  collectionPercentQuery,
  collectionQuery,
  enrollChoicesQuery,
  FEED_QUERY_PREFIX,
  feedQuery,
  FRIENDS_QUERY_PREFIX,
  friendsQuery,
  publishForEnroll,
} = await import('../../web/src/lib/queries.ts');

const USER_ID = '11111111-1111-4111-8111-111111111111';

const BENCH: LiftExercise = {
  id: 'bench',
  name: 'Bench',
  equipment: 'barbell',
  modality: 'lift',
  loadType: 'external',
  custom: false,
  archived: false,
  skillShares: [],
};

const COLLECTION: Collection = {
  exercises: [BENCH],
  data: {
    repMaxesByExercise: new Map([
      ['bench', [{ loadKg: 100, exact: true }, null, null, null, null, null, null, null, null, null]],
    ]),
    maxRepsByExercise: new Map(),
    strengthByExercise: new Map(),
    pinnedExerciseIds: [],
    nextPinPosition: 0,
    cardioRecords: [],
  },
};

describe('query factories', () => {
  it('reads the collection percent from the same cached load as the collection log', () => {
    const percent = collectionPercentQuery(USER_ID);
    expect(percent.queryKey).toEqual(collectionQuery(USER_ID).queryKey);
    expect(percent.select?.({ loaded: COLLECTION, fromCache: false })).toBe(10);
  });

  it('drops every friends list and feed under the exported prefixes', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(friendsQuery(USER_ID).queryKey, []);
    queryClient.setQueryData(feedQuery(USER_ID).queryKey, { pages: [[]], pageParams: [null] });
    queryClient.removeQueries({ queryKey: FRIENDS_QUERY_PREFIX });
    queryClient.removeQueries({ queryKey: FEED_QUERY_PREFIX });
    expect(queryClient.getQueryData(friendsQuery(USER_ID).queryKey)).toBeUndefined();
    expect(queryClient.getQueryData(feedQuery(USER_ID).queryKey)).toBeUndefined();
  });

  it('publishes a program and drops the cached enroll choices so the new version loads', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(enrollChoicesQuery(USER_ID).queryKey, { loaded: [], fromCache: false } as never);
    const published = await publishForEnroll(queryClient, USER_ID, 'program-1', (programId) =>
      Promise.resolve({ key: `custom_${programId}`, version: 2 }),
    );
    expect(published).toEqual({ key: 'custom_program-1', version: 2 });
    expect(queryClient.getQueryData(enrollChoicesQuery(USER_ID).queryKey)).toBeUndefined();
  });

  it('keeps the cached enroll choices when publishing fails', async () => {
    const queryClient = new QueryClient();
    const cached = { loaded: [], fromCache: false };
    queryClient.setQueryData(enrollChoicesQuery(USER_ID).queryKey, cached as never);
    await expect(
      publishForEnroll(queryClient, USER_ID, 'program-1', () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow('offline');
    expect(queryClient.getQueryData(enrollChoicesQuery(USER_ID).queryKey)).toBe(cached);
  });
});
