import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  failFastWhenOffline,
  loadCacheFirstWhenOffline,
  OFFLINE_PROBLEM,
  OfflineError,
  userCache,
} from '../../web/src/offline/cache-first.ts';
import { MemoryStorage } from './memory-storage.ts';

describe('loading cache first while offline', () => {
  const live = { source: 'live' };
  const saved = { source: 'saved' };

  it('shows the saved copy at once without waiting on the network while the device is offline', async () => {
    const loadLive = vi.fn(() => new Promise<typeof live>(() => undefined));
    const outcome = await loadCacheFirstWhenOffline(
      () => true,
      () => saved,
      loadLive,
    );
    expect(outcome).toEqual({ loaded: saved, fromCache: true });
    expect(loadLive).not.toHaveBeenCalled();
  });

  it('fails fast with an offline error and no request while offline with nothing saved', async () => {
    const loadLive = vi.fn(() => Promise.resolve(live));
    await expect(
      loadCacheFirstWhenOffline(
        () => true,
        () => null,
        loadLive,
      ),
    ).rejects.toBeInstanceOf(OfflineError);
    expect(loadLive).not.toHaveBeenCalled();
  });

  it('loads live while online even when a copy is saved', async () => {
    const outcome = await loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.resolve(live),
    );
    expect(outcome).toEqual({ loaded: live, fromCache: false });
  });

  it('falls back to the saved copy when the live load fails', async () => {
    const outcome = await loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.reject(new Error('Failed to fetch')),
    );
    expect(outcome).toEqual({ loaded: saved, fromCache: true });
  });

  it('switches to the saved copy when the device goes offline while the live load runs', async () => {
    const outcome = await loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => new Promise<typeof live>(() => undefined),
      Promise.resolve(),
    );
    expect(outcome).toEqual({ loaded: saved, fromCache: true });
  });

  it('fails fast when the device goes offline while the live load runs and nothing is saved', async () => {
    await expect(
      loadCacheFirstWhenOffline(
        () => false,
        () => null,
        () => new Promise<typeof live>(() => undefined),
        Promise.resolve(),
      ),
    ).rejects.toBeInstanceOf(OfflineError);
  });

  it('rejects with the live problem when the load fails and nothing is saved', async () => {
    await expect(
      loadCacheFirstWhenOffline(
        () => false,
        () => null,
        () => Promise.reject(new Error('Failed to fetch')),
      ),
    ).rejects.toThrow('Failed to fetch');
  });
});

describe('failing fast while offline', () => {
  it('throws an offline error with a readable message when the device is offline', () => {
    expect(() => failFastWhenOffline(() => true)).toThrow(OfflineError);
    expect(() => failFastWhenOffline(() => true)).toThrow(OFFLINE_PROBLEM);
  });

  it('lets the request go ahead while online', () => {
    expect(() => failFastWhenOffline(() => false)).not.toThrow();
  });
});

describe('a per-user saved copy', () => {
  const PREFIX = 'gainscape.example.v1.';
  const cache = userCache(PREFIX, z.object({ count: z.number() }));

  it('reads back what was saved for the same user', () => {
    const storage = new MemoryStorage();
    cache.save(storage, 'user-a', { count: 3 });
    expect(cache.read(storage, 'user-a')).toEqual({ count: 3 });
  });

  it('never shows one user the copy saved for another', () => {
    const storage = new MemoryStorage();
    cache.save(storage, 'user-a', { count: 3 });
    expect(cache.read(storage, 'user-b')).toBeNull();
    storage.setItem(`${PREFIX}user-b`, storage.getItem(`${PREFIX}user-a`)!);
    expect(cache.read(storage, 'user-b')).toBeNull();
  });

  it('ignores a copy that is malformed or has the wrong shape', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${PREFIX}user-a`, '{not json');
    expect(cache.read(storage, 'user-a')).toBeNull();
    storage.setItem(`${PREFIX}user-a`, JSON.stringify({ userId: 'user-a', value: { count: 'three' } }));
    expect(cache.read(storage, 'user-a')).toBeNull();
  });

  it('forgets the copy of one user only', () => {
    const storage = new MemoryStorage();
    cache.save(storage, 'user-a', { count: 1 });
    cache.save(storage, 'user-b', { count: 2 });
    cache.forget(storage, 'user-a');
    expect(cache.read(storage, 'user-a')).toBeNull();
    expect(cache.read(storage, 'user-b')).toEqual({ count: 2 });
  });

  it('works without storage and when storage throws', () => {
    const throwing = new MemoryStorage();
    throwing.getItem = () => {
      throw new Error('blocked');
    };
    throwing.setItem = () => {
      throw new Error('full');
    };
    throwing.removeItem = () => {
      throw new Error('blocked');
    };
    expect(cache.read(null, 'user-a')).toBeNull();
    expect(() => cache.save(null, 'user-a', { count: 1 })).not.toThrow();
    expect(cache.read(throwing, 'user-a')).toBeNull();
    expect(() => cache.save(throwing, 'user-a', { count: 1 })).not.toThrow();
    expect(() => cache.forget(throwing, 'user-a')).not.toThrow();
  });
});
