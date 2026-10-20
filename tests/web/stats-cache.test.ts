import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OfflineError } from '../../web/src/offline/cache-first.ts';
import { loadStatCacheFirst, MAX_SAVED_STATS, statsCache } from '../../web/src/offline/stats-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const countSchema = z.object({ count: z.number() });

const online = () => false;
const offline = () => true;

function load(storage: MemoryStorage, key: string, live: () => Promise<{ count: number }>, isOffline = online) {
  return loadStatCacheFirst(storage, USER_ID, key, countSchema, live, isOffline);
}

describe('loadStatCacheFirst', () => {
  it('loads live online and saves the answer under its key', async () => {
    const storage = new MemoryStorage();
    expect(await load(storage, 'days:2026-10', async () => ({ count: 3 }))).toEqual({
      loaded: { count: 3 },
      fromCache: false,
    });
    expect(statsCache.read(storage, USER_ID)).toEqual({ 'days:2026-10': { count: 3 } });
  });

  it('shows the saved answer of the same key while offline without asking the server', async () => {
    const storage = new MemoryStorage();
    await load(storage, 'days:2026-10', async () => ({ count: 3 }));
    const neverCalled = () => Promise.reject(new Error('asked the server'));
    expect(await load(storage, 'days:2026-10', neverCalled, offline)).toEqual({
      loaded: { count: 3 },
      fromCache: true,
      offline: true,
    });
    await expect(load(storage, 'days:2026-09', neverCalled, offline)).rejects.toBeInstanceOf(OfflineError);
  });

  it('falls back to the saved answer when the server fails', async () => {
    const storage = new MemoryStorage();
    await load(storage, 'days:2026-10', async () => ({ count: 3 }));
    const failing = () => Promise.reject(new Error('Server down'));
    expect(await load(storage, 'days:2026-10', failing)).toEqual({
      loaded: { count: 3 },
      fromCache: true,
      offline: false,
      problem: 'Server down',
    });
  });

  it('ignores a saved answer of an older shape', async () => {
    const storage = new MemoryStorage();
    statsCache.save(storage, USER_ID, { 'days:2026-10': { total: 3 } });
    await expect(
      load(storage, 'days:2026-10', () => Promise.reject(new Error('asked the server')), offline),
    ).rejects.toBeInstanceOf(OfflineError);
  });

  it("never hands one user's stats to another", async () => {
    const storage = new MemoryStorage();
    await load(storage, 'days:2026-10', async () => ({ count: 3 }));
    expect(statsCache.read(storage, OTHER_USER_ID)).toBeNull();
  });

  it('keeps only the most recently loaded answers, so browsing months cannot fill the device', async () => {
    const storage = new MemoryStorage();
    for (let index = 0; index <= MAX_SAVED_STATS; index++)
      await load(storage, `days:${index}`, async () => ({ count: index }));
    await load(storage, 'days:1', async () => ({ count: 1 }));
    await load(storage, 'days:new', async () => ({ count: 99 }));
    const keys = Object.keys(statsCache.read(storage, USER_ID) ?? {});
    expect(keys).toHaveLength(MAX_SAVED_STATS);
    expect(keys).not.toContain('days:0');
    expect(keys).not.toContain('days:2');
    expect(keys).toContain('days:1');
    expect(keys.at(-1)).toBe('days:new');
  });
});
