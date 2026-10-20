import { describe, expect, it } from 'vitest';
import { type Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  forgetItemsCache,
  type ItemsCache,
  itemsFromLiveAndCache,
  readItemsCache,
  saveItemsCache,
  spendCachedScroll,
  updateItemsCache,
} from '../../web/src/offline/items-cache.ts';
import { MemoryStorage, throwingStorage } from './memory-storage.ts';

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
    { id: 'deadlift', name: 'Deadlift', archived: false, modality: 'lift', loadType: 'external', equipment: 'barbell' },
    { id: 'pull_up', name: 'Pull-up', archived: false, modality: 'lift', loadType: 'bodyweight' },
  ],
  dryRolls: 2,
};

describe('items cache', () => {
  it('reads back what it saved for the same user', () => {
    const storage = new MemoryStorage();
    saveItemsCache(storage, USER, CACHE);
    expect(readItemsCache(storage, USER)).toEqual(CACHE);
  });

  it('reads a copy saved before the luck meter with unknown dry rolls', () => {
    const storage = new MemoryStorage();
    saveItemsCache(storage, USER, CACHE);
    const key = storage.key(0)!;
    const withoutLuck: Partial<ItemsCache> = { ...CACHE };
    delete withoutLuck.dryRolls;
    storage.setItem(key, JSON.stringify({ v: 1, userId: USER, cache: withoutLuck }));
    expect(readItemsCache(storage, USER)).toEqual({ ...CACHE, dryRolls: null });
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
    const throwing = throwingStorage('getItem', 'setItem');
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
    const throwing = throwingStorage('removeItem');
    expect(() => forgetItemsCache(throwing, USER)).not.toThrow();
  });

  it('spends one scroll of the challenge a synced workout used, as the server does', () => {
    const storage = new MemoryStorage();
    saveItemsCache(storage, USER, CACHE);
    spendCachedScroll(storage, USER, 'challenge-dl');
    expect(readItemsCache(storage, USER)?.inventory).toEqual([
      { itemId: 'scroll-1', quantity: 0, firstObtainedAt: '2026-10-01T10:00:00.000Z' },
    ]);
    spendCachedScroll(storage, USER, 'challenge-dl');
    expect(readItemsCache(storage, USER)?.inventory[0].quantity).toBe(0);
  });

  it('leaves the saved items alone for a challenge no saved scroll grants, and saves nothing without a cache', () => {
    const storage = new MemoryStorage();
    spendCachedScroll(storage, USER, 'challenge-dl');
    expect(readItemsCache(storage, USER)).toBeNull();
    saveItemsCache(storage, USER, CACHE);
    spendCachedScroll(storage, USER, 'challenge-unknown');
    expect(readItemsCache(storage, USER)).toEqual(CACHE);
    expect(() => spendCachedScroll(null, USER, 'challenge-dl')).not.toThrow();
  });
});

const DEADLIFT: Exercise = {
  id: 'deadlift',
  key: 'deadlift',
  name: 'Conventional Deadlift',
  equipment: 'barbell',
  custom: false,
  archived: false,
  skillShares: [],
  modality: 'lift',
  loadType: 'external',
};

const LIVE_AS_OF = '2026-10-10T09:00:00.000Z';

const LIVE = {
  catalog: CACHE.catalog,
  inventory: [{ itemId: 'belt-1', quantity: 1, firstObtainedAt: '2026-10-09T10:00:00.000Z' }],
  exercises: [DEADLIFT],
  strength: { deadlift: { windowMax: 150, fallbackMax: null, hasPriorSession: true } },
  strengthAsOf: LIVE_AS_OF,
  dryRolls: 5,
};

describe('items from live data and the saved copy', () => {
  it('takes the live inventory, exercises and strength', () => {
    expect(itemsFromLiveAndCache(LIVE, CACHE, null)).toEqual({
      catalog: CACHE.catalog,
      inventory: LIVE.inventory,
      strength: LIVE.strength,
      strengthAsOf: LIVE_AS_OF,
      challengeExercises: [
        {
          id: 'deadlift',
          name: 'Conventional Deadlift',
          archived: false,
          modality: 'lift',
          loadType: 'external',
          equipment: 'barbell',
        },
      ],
      dryRolls: 5,
    });
  });

  it('keeps the saved challenge exercises and strength when those live loads failed', () => {
    const merged = itemsFromLiveAndCache({ ...LIVE, exercises: null, strength: null }, CACHE, [DEADLIFT]);
    expect(merged.challengeExercises).toEqual(CACHE.challengeExercises);
    expect(merged.strength).toEqual(CACHE.strength);
    expect(merged.strengthAsOf).toBe(CACHE.strengthAsOf);
  });

  it('keeps the saved dry rolls when the live luck load failed, and has none without a saved copy', () => {
    expect(itemsFromLiveAndCache({ ...LIVE, dryRolls: null }, CACHE, null).dryRolls).toBe(2);
    expect(itemsFromLiveAndCache({ ...LIVE, dryRolls: null }, null, null).dryRolls).toBeNull();
  });

  it('falls back to the saved exercise list and no strength without a saved copy', () => {
    const merged = itemsFromLiveAndCache({ ...LIVE, exercises: null, strength: null }, null, [DEADLIFT]);
    expect(merged.challengeExercises.map((exercise) => exercise.id)).toEqual(['deadlift']);
    expect(merged.strength).toEqual({});
    expect(merged.strengthAsOf).toBe(LIVE_AS_OF);
  });
});

describe('updating the saved items', () => {
  it('saves a refetched inventory after a craft so the offline copy is current', () => {
    const storage = new MemoryStorage();
    saveItemsCache(storage, USER, CACHE);
    updateItemsCache(storage, USER, (cache) => ({ ...cache, inventory: LIVE.inventory }));
    expect(readItemsCache(storage, USER)).toEqual({ ...CACHE, inventory: LIVE.inventory });
  });

  it('saves nothing without a saved copy', () => {
    const storage = new MemoryStorage();
    updateItemsCache(storage, USER, (cache) => ({ ...cache, inventory: LIVE.inventory }));
    expect(readItemsCache(storage, USER)).toBeNull();
  });
});
