import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../web/src/lib/profile/profile-rules.ts';
import type { CacheFirstLoad } from '../../web/src/offline/cache-first.ts';
import { profileCache } from '../../web/src/offline/profile-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const server = vi.hoisted(() => ({
  updates: [] as { table: string; row: unknown; userId: unknown }[],
  error: null as { message: string } | null,
}));

vi.mock('../../web/src/lib/platform/supabase.ts', () => ({
  supabase: {
    from: (table: string) => ({
      update: (row: unknown) => ({
        eq: (_column: string, userId: unknown) => {
          server.updates.push({ table, row, userId });
          return Promise.resolve({ error: server.error });
        },
      }),
    }),
  },
}));

const { saveBodyweight } = await import('../../web/src/features/profile/save-bodyweight.ts');

const USER_ID = '11111111-1111-4111-8111-111111111111';

const PROFILE: Profile = {
  username: 'lifter',
  displayName: 'Lifter',
  bio: null,
  trainingFocus: null,
  trainingSince: null,
  badgeColor: 'gold',
  showWeights: true,
  showBodyweight: false,
  createdAt: '2026-10-01T08:00:00.000Z',
  bodyweightKg: null,
  heightCm: null,
  birthYear: null,
  sex: null,
  unitPref: 'kg',
  effortInputMode: 'level',
  timezone: 'UTC',
  timezoneChangedAt: null,
};

function loadedProfile(queryClient: QueryClient) {
  return queryClient.getQueryData<CacheFirstLoad<Profile>>(['profile', USER_ID])?.loaded;
}

describe('saveBodyweight', () => {
  beforeEach(() => {
    server.updates = [];
    server.error = null;
  });

  it('saves the bodyweight on the server, on this device and in the loaded profile', async () => {
    const storage = new MemoryStorage();
    profileCache.save(storage, USER_ID, PROFILE);
    const queryClient = new QueryClient();
    queryClient.setQueryData<CacheFirstLoad<Profile>>(['profile', USER_ID], { loaded: PROFILE, fromCache: false });

    await saveBodyweight({ userId: USER_ID, bodyweightKg: 81.5, storage, queryClient });

    expect(server.updates).toEqual([{ table: 'profile_private', row: { bodyweight_kg: 81.5 }, userId: USER_ID }]);
    expect(profileCache.read(storage, USER_ID)?.bodyweightKg).toBe(81.5);
    expect(loadedProfile(queryClient)?.bodyweightKg).toBe(81.5);
  });

  it('refetches the profile when it had not loaded, so the latest bodyweight still shows the saved weight', async () => {
    const queryClient = new QueryClient();
    queryClient.getQueryCache().build(queryClient, { queryKey: ['profile', USER_ID] });
    expect(queryClient.getQueryState(['profile', USER_ID])?.isInvalidated).toBe(false);

    await saveBodyweight({ userId: USER_ID, bodyweightKg: 81.5, storage: new MemoryStorage(), queryClient });

    expect(queryClient.getQueryState(['profile', USER_ID])?.isInvalidated).toBe(true);
  });

  it('marks the bodyweight trend stale so the Profile chart shows the new weight', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['bodyweight-trend', USER_ID], []);

    await saveBodyweight({ userId: USER_ID, bodyweightKg: 81.5, storage: new MemoryStorage(), queryClient });

    expect(queryClient.getQueryState(['bodyweight-trend', USER_ID])?.isInvalidated).toBe(true);
  });

  it('keeps the device and the loaded profile unchanged when the server refuses', async () => {
    const storage = new MemoryStorage();
    profileCache.save(storage, USER_ID, PROFILE);
    const queryClient = new QueryClient();
    queryClient.setQueryData<CacheFirstLoad<Profile>>(['profile', USER_ID], { loaded: PROFILE, fromCache: false });
    server.error = { message: 'nope' };

    await expect(saveBodyweight({ userId: USER_ID, bodyweightKg: 81.5, storage, queryClient })).rejects.toEqual({
      message: 'nope',
    });

    expect(profileCache.read(storage, USER_ID)?.bodyweightKg).toBeNull();
    expect(loadedProfile(queryClient)?.bodyweightKg).toBeNull();
  });
});
