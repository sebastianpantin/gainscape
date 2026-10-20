import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OfflineError } from '../../web/src/offline/cache-first.ts';
import {
  forgetStatsCache,
  loadStatCacheFirst,
  SAVED_STAT_ENTRIES,
  STAT_FAMILIES,
  type StatFamily,
  statFamilyCache,
} from '../../web/src/offline/stats-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const RETIRED_KEY = `gainscape.stats.v1.${USER_ID}`;
const countSchema = z.object({ count: z.number() });

const online = () => false;
const offline = () => true;

function load(
  storage: MemoryStorage,
  family: StatFamily,
  entry: string,
  live: () => Promise<{ count: number }>,
  isOffline = online,
) {
  return loadStatCacheFirst(storage, USER_ID, { family, entry }, countSchema, live, isOffline);
}

const neverCalled = () => Promise.reject(new Error('asked the server'));

describe('loadStatCacheFirst', () => {
  it('loads live online and saves the answer under its family and entry', async () => {
    const storage = new MemoryStorage();
    expect(await load(storage, 'training-days', '2026-10', async () => ({ count: 3 }))).toEqual({
      loaded: { count: 3 },
      fromCache: false,
    });
    expect(statFamilyCache('training-days').read(storage, USER_ID)).toEqual({ '2026-10': { count: 3 } });
    expect(statFamilyCache('loot-stats').read(storage, USER_ID)).toBeNull();
  });

  it('shows the saved answer of the same entry while offline without asking the server', async () => {
    const storage = new MemoryStorage();
    await load(storage, 'training-days', '2026-10', async () => ({ count: 3 }));
    expect(await load(storage, 'training-days', '2026-10', neverCalled, offline)).toEqual({
      loaded: { count: 3 },
      fromCache: true,
      offline: true,
    });
    await expect(load(storage, 'training-days', '2026-09', neverCalled, offline)).rejects.toBeInstanceOf(OfflineError);
  });

  it('falls back to the saved answer when the server fails', async () => {
    const storage = new MemoryStorage();
    await load(storage, 'loot-stats', '', async () => ({ count: 3 }));
    const failing = () => Promise.reject(new Error('Server down'));
    expect(await load(storage, 'loot-stats', '', failing)).toEqual({
      loaded: { count: 3 },
      fromCache: true,
      offline: false,
      problem: 'Server down',
    });
  });

  it('ignores a saved answer of an older shape', async () => {
    const storage = new MemoryStorage();
    statFamilyCache('training-days').save(storage, USER_ID, { '2026-10': { total: 3 } });
    await expect(load(storage, 'training-days', '2026-10', neverCalled, offline)).rejects.toBeInstanceOf(OfflineError);
  });

  it("never hands one user's stats to another", async () => {
    const storage = new MemoryStorage();
    await load(storage, 'training-days', '2026-10', async () => ({ count: 3 }));
    expect(statFamilyCache('training-days').read(storage, OTHER_USER_ID)).toBeNull();
  });

  it('keeps only the most recently loaded months, so browsing months cannot fill the device', async () => {
    const storage = new MemoryStorage();
    const limit = SAVED_STAT_ENTRIES['training-days'];
    for (let index = 0; index <= limit; index++)
      await load(storage, 'training-days', `month-${index}`, async () => ({ count: index }));
    await load(storage, 'training-days', 'month-1', async () => ({ count: 1 }));
    await load(storage, 'training-days', 'month-new', async () => ({ count: 99 }));
    const entries = Object.keys(statFamilyCache('training-days').read(storage, USER_ID) ?? {});
    expect(entries).toHaveLength(limit);
    expect(entries).not.toContain('month-0');
    expect(entries).not.toContain('month-2');
    expect(entries).toContain('month-1');
    expect(entries.at(-1)).toBe('month-new');
  });

  it('never lets browsing months evict another family', async () => {
    const storage = new MemoryStorage();
    await load(storage, 'weekly-exercise-sets', '', async () => ({ count: 1 }));
    await load(storage, 'loot-stats', '', async () => ({ count: 2 }));
    await load(storage, 'record-timeline', '', async () => ({ count: 3 }));
    await load(storage, 'relative-strength', 'bench', async () => ({ count: 4 }));
    for (let index = 0; index < 100; index++)
      await load(storage, 'training-days', `month-${index}`, async () => ({ count: index }));
    for (const [family, entry, count] of [
      ['weekly-exercise-sets', '', 1],
      ['loot-stats', '', 2],
      ['record-timeline', '', 3],
      ['relative-strength', 'bench', 4],
    ] as const) {
      expect(await load(storage, family, entry, neverCalled, offline)).toMatchObject({ loaded: { count } });
    }
  });

  it('caps the saved lifts of relative strength on their own', async () => {
    const storage = new MemoryStorage();
    const limit = SAVED_STAT_ENTRIES['relative-strength'];
    for (let index = 0; index <= limit; index++)
      await load(storage, 'relative-strength', `lift-${index}`, async () => ({ count: index }));
    expect(Object.keys(statFamilyCache('relative-strength').read(storage, USER_ID) ?? {})).toHaveLength(limit);
  });

  it('removes the retired single-record cache when it saves', async () => {
    const storage = new MemoryStorage();
    storage.setItem(RETIRED_KEY, JSON.stringify({ userId: USER_ID, value: { 'loot-stats': { count: 1 } } }));
    await expect(load(storage, 'loot-stats', '', neverCalled, offline)).rejects.toBeInstanceOf(OfflineError);
    await load(storage, 'loot-stats', '', async () => ({ count: 2 }));
    expect(storage.getItem(RETIRED_KEY)).toBeNull();
  });
});

describe('forgetStatsCache', () => {
  it('forgets every family and the retired cache of that user only', async () => {
    const storage = new MemoryStorage();
    for (const family of STAT_FAMILIES) {
      statFamilyCache(family).save(storage, USER_ID, { entry: { count: 1 } });
      statFamilyCache(family).save(storage, OTHER_USER_ID, { entry: { count: 1 } });
    }
    storage.setItem(RETIRED_KEY, '{}');
    forgetStatsCache(storage, USER_ID);
    for (const family of STAT_FAMILIES) {
      expect(statFamilyCache(family).read(storage, USER_ID)).toBeNull();
      expect(statFamilyCache(family).read(storage, OTHER_USER_ID)).not.toBeNull();
    }
    expect(storage.getItem(RETIRED_KEY)).toBeNull();
  });
});
