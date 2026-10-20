import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveCachedExercises } from '../../web/src/lib/exercises/catalog-cache.ts';
import { MemoryStorage } from './memory-storage.ts';
import type { LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { Collection } from '../../web/src/lib/collection/collection-data.ts';

vi.mock('../../web/src/lib/platform/supabase.ts', () => ({ supabase: {} }));

const {
  collectionPercentQuery,
  collectionQuery,
  enrollChoicesQuery,
  exerciseListLoadQuery,
  exerciseListQuery,
  FEED_QUERY_PREFIX,
  feedPreviewQuery,
  feedQuery,
  FRIENDS_QUERY_PREFIX,
  friendsQuery,
  latestBodyweightQuery,
  preferencesQuery,
  profileQuery,
  publishForEnroll,
} = await import('../../web/src/lib/query/queries.ts');

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

  it('keeps the Today feed preview fresh for a minute under the feed prefix, so feed changes still reach it', () => {
    const preview = feedPreviewQuery(USER_ID);
    expect(preview.queryKey.slice(0, FEED_QUERY_PREFIX.length)).toEqual([...FEED_QUERY_PREFIX]);
    expect(preview.staleTime).toBe(60_000);
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

describe('profile reads', () => {
  const profile = {
    username: 'lifter',
    displayName: 'Lifter',
    bio: null,
    trainingFocus: null,
    trainingSince: null,
    badgeColor: 'blue',
    showWeights: true,
    showBodyweight: false,
    createdAt: '2026-01-01T00:00:00Z',
    bodyweightKg: 82.5,
    heightCm: null,
    birthYear: null,
    sex: null,
    unitPref: 'lb',
    effortInputMode: 'rir',
    timezone: 'UTC',
    timezoneChangedAt: null,
  } as const;

  it('reads the preferences and the latest bodyweight from the cached profile, so a profile save reaches them', () => {
    const preferences = preferencesQuery(USER_ID);
    const bodyweight = latestBodyweightQuery(USER_ID);
    expect(preferences.queryKey).toEqual(profileQuery(USER_ID).queryKey);
    expect(bodyweight.queryKey).toEqual(profileQuery(USER_ID).queryKey);
    const load = { loaded: profile, fromCache: false } as const;
    expect(preferences.select?.(load)).toEqual({ unitPref: 'lb', effortInputMode: 'rir' });
    expect(bodyweight.select?.(load)).toBe(82.5);
  });
});

describe('exerciseListQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  function deviceWith(exercises: LiftExercise[]) {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, USER_ID, exercises);
    vi.stubGlobal('window', { localStorage: storage });
  }

  it('starts from the saved exercise list as stale data, so every screen sees it offline and refetches', () => {
    const chestBench = { ...BENCH, skillShares: [{ skillKey: 'chest', skillName: 'Chest', shareBasisPoints: 7000 }] };
    deviceWith([chestBench]);
    const query = exerciseListLoadQuery(USER_ID);
    expect(typeof query.initialData === 'function' && query.initialData()).toEqual({
      loaded: [chestBench],
      fromCache: false,
    });
    expect(query.initialDataUpdatedAt).toBe(0);
  });

  it('hands screens that need only the list the exercises of the same cached load', () => {
    const list = exerciseListQuery(USER_ID);
    expect(list.queryKey).toEqual(exerciseListLoadQuery(USER_ID).queryKey);
    expect(list.select?.({ loaded: [BENCH], fromCache: true, offline: true })).toEqual([BENCH]);
  });

  it('starts empty when the saved list predates skill shares or the device has none', () => {
    deviceWith([BENCH]);
    const query = exerciseListLoadQuery(USER_ID);
    expect(typeof query.initialData === 'function' && query.initialData()).toBeUndefined();
    vi.stubGlobal('window', undefined);
    expect(typeof query.initialData === 'function' && query.initialData()).toBeUndefined();
  });
});
