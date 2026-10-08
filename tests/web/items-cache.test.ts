import { describe, expect, it, vi } from 'vitest';
import {
  forgetItemsCache,
  type ItemsCache,
  loadItemsCacheFirstWhenOffline,
  readItemsCache,
  saveItemsCache,
} from '../../web/src/offline/items-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER = 'user-a';

const CACHE: ItemsCache = {
  catalog: {
    items: [
      {
        id: 'scroll-1',
        key: 'scroll_deficit_deadlift',
        name: 'Scroll: Deadlift and Pull-up',
        kind: 'scroll',
        rarity: 'rare',
        tier: null,
        gearSlot: null,
        icon: 'scroll',
        description: 'A challenge.',
        grantsChallengeId: 'challenge-dl',
        sortOrder: 1,
      },
      {
        id: 'belt-1',
        key: 'rookie_belt',
        name: 'Rookie belt',
        kind: 'gear',
        rarity: 'common',
        tier: 'rookie',
        gearSlot: 'belt',
        icon: 'belt',
        description: '',
        grantsChallengeId: null,
        sortOrder: 2,
      },
    ],
    recipes: [{ id: 'recipe-1', key: 'belt', outputItemId: 'belt-1', outputQuantity: 1, inputs: [] }],
    challenges: [
      {
        id: 'challenge-dl',
        key: 'deadlift_and_pull_up',
        name: 'Deadlift and Pull-up',
        definition: {
          kind: 'prescription',
          groups: [
            {
              rounds: 5,
              exercises: [
                { exerciseId: 'deadlift', reps: 5, pct: 70 },
                { exerciseId: 'pull_up', reps: 5, pct: null },
              ],
            },
          ],
        },
      },
    ],
  },
  inventory: [{ itemId: 'scroll-1', quantity: 1, firstObtainedAt: '2026-10-01T10:00:00.000Z' }],
  strength: { deadlift: { windowMax: 140, fallbackMax: null, hasPriorSession: true } },
  strengthAsOf: '2026-10-08T09:00:00.000Z',
  challengeExercises: [
    { id: 'deadlift', name: 'Deadlift', archived: false, modality: 'lift', loadType: 'external' },
    { id: 'pull_up', name: 'Pull-up', archived: false, modality: 'lift', loadType: 'bodyweight' },
  ],
};

describe('items cache', () => {
  it('reads back what it saved for the same user', () => {
    const storage = new MemoryStorage();
    saveItemsCache(storage, USER, CACHE);
    expect(readItemsCache(storage, USER)).toEqual(CACHE);
  });

  it('reads nothing for another user', () => {
    const storage = new MemoryStorage();
    saveItemsCache(storage, USER, CACHE);
    expect(readItemsCache(storage, 'user-b')).toBeNull();
  });

  it('reads nothing when nothing was saved, the entry is not JSON or it has the wrong shape', () => {
    const storage = new MemoryStorage();
    expect(readItemsCache(storage, USER)).toBeNull();
    saveItemsCache(storage, USER, CACHE);
    const key = storage.key(0)!;
    storage.setItem(key, '{broken');
    expect(readItemsCache(storage, USER)).toBeNull();
    storage.setItem(key, JSON.stringify({ userId: USER, cache: { ...CACHE, inventory: 'none' } }));
    expect(readItemsCache(storage, USER)).toBeNull();
  });

  it('degrades silently when storage throws or is missing', () => {
    const throwing = new MemoryStorage();
    throwing.getItem = () => {
      throw new Error('blocked');
    };
    throwing.setItem = () => {
      throw new Error('blocked');
    };
    expect(() => saveItemsCache(throwing, USER, CACHE)).not.toThrow();
    expect(readItemsCache(throwing, USER)).toBeNull();
    expect(() => saveItemsCache(null, USER, CACHE)).not.toThrow();
    expect(readItemsCache(null, USER)).toBeNull();
  });

  it('forgets the saved items of one user only', () => {
    const storage = new MemoryStorage();
    saveItemsCache(storage, USER, CACHE);
    saveItemsCache(storage, 'user-b', CACHE);
    forgetItemsCache(storage, USER);
    expect(readItemsCache(storage, USER)).toBeNull();
    expect(readItemsCache(storage, 'user-b')).toEqual(CACHE);
  });

  it('forgets silently when storage throws', () => {
    const throwing = new MemoryStorage();
    throwing.removeItem = () => {
      throw new Error('blocked');
    };
    expect(() => forgetItemsCache(throwing, USER)).not.toThrow();
  });
});

describe('loading the items screen', () => {
  const live = { source: 'live' };
  const saved = { source: 'saved' };

  it('shows the saved items at once without waiting on the network while the device is offline', async () => {
    const loadLive = vi.fn(() => new Promise<typeof live>(() => undefined));
    const outcome = await loadItemsCacheFirstWhenOffline(
      () => true,
      () => saved,
      loadLive,
    );
    expect(outcome).toEqual({ loaded: saved, fromCache: true });
    expect(loadLive).not.toHaveBeenCalled();
  });

  it('loads live while online even when items are saved', async () => {
    const outcome = await loadItemsCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.resolve(live),
    );
    expect(outcome).toEqual({ loaded: live, fromCache: false });
  });

  it('tries the network while offline when nothing is saved', async () => {
    const outcome = await loadItemsCacheFirstWhenOffline(
      () => true,
      () => null,
      () => Promise.resolve(live),
    );
    expect(outcome).toEqual({ loaded: live, fromCache: false });
  });

  it('falls back to the saved items when the live load fails', async () => {
    const outcome = await loadItemsCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.reject(new Error('Failed to fetch')),
    );
    expect(outcome).toEqual({ loaded: saved, fromCache: true });
  });

  it('rejects with the live problem when the load fails and nothing is saved', async () => {
    await expect(
      loadItemsCacheFirstWhenOffline(
        () => false,
        () => null,
        () => Promise.reject(new Error('Failed to fetch')),
      ),
    ).rejects.toThrow('Failed to fetch');
  });
});
