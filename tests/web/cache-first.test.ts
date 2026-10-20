import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  cacheFirstNotice,
  failFastWhenOffline,
  loadCacheFirstWhenOffline,
  OFFLINE_PROBLEM,
  OfflineError,
  savedCopyNotice,
  userCache,
} from '../../web/src/offline/cache-first.ts';
import { MemoryStorage, throwingStorage } from './memory-storage.ts';

function offlineSwitch() {
  let notifyOffline: () => void = () => undefined;
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((onOffline: () => void) => {
    notifyOffline = onOffline;
    return unsubscribe;
  });
  return { subscribe, unsubscribe, goOffline: () => notifyOffline() };
}

const never = <Loaded>() => new Promise<Loaded>(() => undefined);

describe('loading cache first while offline', () => {
  const live = { source: 'live' };
  const saved = { source: 'saved' };

  it('shows the saved copy at once without waiting on the network while the device is offline', async () => {
    const loadLive = vi.fn(never<typeof live>);
    const { subscribe } = offlineSwitch();
    const outcome = await loadCacheFirstWhenOffline(
      () => true,
      () => saved,
      loadLive,
      subscribe,
    );
    expect(outcome).toEqual({ loaded: saved, fromCache: true, offline: true });
    expect(loadLive).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
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

  it('loads live while online even when a copy is saved, and stops listening for offline afterwards', async () => {
    const { subscribe, unsubscribe } = offlineSwitch();
    const outcome = await loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.resolve(live),
      subscribe,
    );
    expect(outcome).toEqual({ loaded: live, fromCache: false });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps the live result when the device goes offline after it arrived', async () => {
    const { subscribe, goOffline } = offlineSwitch();
    const outcome = await loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.resolve(live),
      subscribe,
    );
    goOffline();
    expect(outcome).toEqual({ loaded: live, fromCache: false });
  });

  it('falls back to the saved copy as offline when the request cannot reach the network', async () => {
    const { subscribe, unsubscribe } = offlineSwitch();
    const outcome = await loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.reject(new TypeError('Failed to fetch')),
      subscribe,
    );
    expect(outcome).toEqual({ loaded: saved, fromCache: true, offline: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps the server problem with the saved copy when the server answers with an error while online', async () => {
    const outcome = await loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      () => Promise.reject({ message: 'permission denied for table profiles', code: '42501' }),
    );
    expect(outcome).toEqual({
      loaded: saved,
      fromCache: true,
      offline: false,
      problem: 'permission denied for table profiles',
    });
  });

  it('switches to the saved copy when the device goes offline while the live load runs', async () => {
    const { subscribe, unsubscribe, goOffline } = offlineSwitch();
    const loading = loadCacheFirstWhenOffline(
      () => false,
      () => saved,
      never<typeof live>,
      subscribe,
    );
    goOffline();
    expect(await loading).toEqual({ loaded: saved, fromCache: true, offline: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('fails fast when the device goes offline while the live load runs and nothing is saved', async () => {
    const { subscribe, goOffline } = offlineSwitch();
    const loading = loadCacheFirstWhenOffline(
      () => false,
      () => null,
      never<typeof live>,
      subscribe,
    );
    goOffline();
    await expect(loading).rejects.toBeInstanceOf(OfflineError);
  });

  it('rejects with the live problem when the load fails and nothing is saved', async () => {
    const { subscribe, unsubscribe } = offlineSwitch();
    await expect(
      loadCacheFirstWhenOffline(
        () => false,
        () => null,
        () => Promise.reject(new Error('rate_limited')),
        subscribe,
      ),
    ).rejects.toThrow('rate_limited');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('the notice for a saved copy', () => {
  it('says nothing for a live load', () => {
    expect(cacheFirstNotice({ loaded: 1, fromCache: false }, 'Offline: saved.')).toBeNull();
  });

  it('uses the screen offline notice when offline', () => {
    expect(cacheFirstNotice({ loaded: 1, fromCache: true, offline: true }, 'Offline: saved.')).toBe('Offline: saved.');
  });

  it('names the server problem when online', () => {
    expect(
      cacheFirstNotice(
        { loaded: 1, fromCache: true, offline: false, problem: 'Too many requests.' },
        'Offline: saved.',
      ),
    ).toBe(savedCopyNotice('Too many requests.'));
    expect(savedCopyNotice('Too many requests.')).toContain('Too many requests.');
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
    const throwing = throwingStorage('getItem', 'setItem', 'removeItem');
    expect(cache.read(null, 'user-a')).toBeNull();
    expect(() => cache.save(null, 'user-a', { count: 1 })).not.toThrow();
    expect(cache.read(throwing, 'user-a')).toBeNull();
    expect(() => cache.save(throwing, 'user-a', { count: 1 })).not.toThrow();
    expect(() => cache.forget(throwing, 'user-a')).not.toThrow();
  });
});
