import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDraftStore, openDraftStoreOrFallback, openPrimaryDraftStore } from '../../web/src/offline/draft-boot.ts';
import { draftRecord } from '../../web/src/offline/draft-format.ts';
import {
  createIdbDraftStore,
  createLocalDraftStore,
  fallbackKeyFor,
  openDraftDatabase,
} from '../../web/src/offline/draft-store.ts';
import { workout } from './draft-store.contract.ts';
import { MemoryStorage } from './memory-storage.ts';

const userId = '11111111-1111-4111-8111-111111111111';

const unopenableIndexedDb = {
  open: () => {
    throw new Error('idb_broken');
  },
} as unknown as IDBFactory;

class StorageWrittenDuringBoot extends MemoryStorage {
  private pendingWrite: (() => void) | null;

  constructor(write: (storage: Storage) => void) {
    super();
    this.pendingWrite = () => write(this);
  }

  override getItem(key: string): string | null {
    const value = super.getItem(key);
    const write = this.pendingWrite;
    this.pendingWrite = null;
    if (write) queueMicrotask(write);
    return value;
  }
}

const silentIndexedDb = { open: () => ({}) } as unknown as IDBFactory;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('draft store boot', () => {
  it('fails instead of quietly booting on the fallback when IndexedDB cannot be opened', async () => {
    await expect(openDraftStore({ indexedDB: unopenableIndexedDb, storage: new MemoryStorage() })).rejects.toThrow();
  });

  it('fails when IndexedDB does not answer in time', async () => {
    vi.useFakeTimers();
    const booting = openDraftStore({ indexedDB: silentIndexedDb, storage: new MemoryStorage() });
    const failed = expect(booting).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2_000);
    await failed;
  });

  it('boots on the localStorage store when the browser has no IndexedDB', async () => {
    const storage = new MemoryStorage();
    const booted = await openDraftStore({ indexedDB: undefined, storage });
    expect(await booted.put(userId, 10, workout('session-a'))).toBe('written');
    expect(storage.getItem(fallbackKeyFor(userId))).not.toBeNull();
  });

  it('keeps both workouts when the fallback holds another session than the stored draft', async () => {
    const indexedDB = new IDBFactory();
    const storage = new MemoryStorage();
    const database = await openDraftDatabase(indexedDB);
    await createIdbDraftStore(database!).put(userId, 20, workout('unsynced-in-idb'));
    const newerFallback = draftRecord(userId, 30, workout('started-while-idb-was-down'));
    storage.setItem(fallbackKeyFor(userId), JSON.stringify(newerFallback));

    const booted = await openDraftStore({ indexedDB, storage });
    expect(await booted.get(userId)).toEqual(draftRecord(userId, 20, workout('unsynced-in-idb')));
    expect(JSON.parse(storage.getItem(fallbackKeyFor(userId))!)).toEqual(newerFallback);
    database!.close();
  });

  it('opens a kept fallback workout once the stored workout of another session is finished or discarded', async () => {
    for (const resolveStored of ['markSynced', 'discard'] as const) {
      const indexedDB = new IDBFactory();
      const storage = new MemoryStorage();
      const database = await openDraftDatabase(indexedDB);
      const idbStore = createIdbDraftStore(database!);
      await idbStore.put(userId, 20, workout('unsynced-in-idb', '2026-09-30T11:00:00.000Z'));
      const keptFallback = draftRecord(userId, 30, workout('started-while-idb-was-down'));
      storage.setItem(fallbackKeyFor(userId), JSON.stringify(keptFallback));
      await openDraftStore({ indexedDB, storage });

      await idbStore[resolveStored](userId, 'unsynced-in-idb', 40);
      const booted = await openDraftStore({ indexedDB, storage });

      expect(await booted.get(userId)).toEqual(keptFallback);
      expect(storage.getItem(fallbackKeyFor(userId))).toBeNull();
      database!.close();
    }
  });

  it('leaves a fallback write made while boot moved the older record', async () => {
    const indexedDB = new IDBFactory();
    const storage = new StorageWrittenDuringBoot((written) =>
      written.setItem(fallbackKeyFor(userId), JSON.stringify(draftRecord(userId, 20, workout('session-a')))),
    );
    storage.setItem(fallbackKeyFor(userId), JSON.stringify(draftRecord(userId, 10, workout('session-a'))));

    await openDraftStore({ indexedDB, storage });

    expect(JSON.parse(storage.getItem(fallbackKeyFor(userId))!)).toEqual(draftRecord(userId, 20, workout('session-a')));
    const rebooted = await openDraftStore({ indexedDB, storage });
    expect(await rebooted.get(userId)).toEqual(draftRecord(userId, 20, workout('session-a')));
    expect(storage.getItem(fallbackKeyFor(userId))).toBeNull();
  });

  it('keeps a discard made on the fallback after boot raced a fallback write', async () => {
    const indexedDB = new IDBFactory();
    const storage = new StorageWrittenDuringBoot((written) =>
      written.setItem(fallbackKeyFor(userId), JSON.stringify(draftRecord(userId, 20, workout('session-a')))),
    );
    storage.setItem(fallbackKeyFor(userId), JSON.stringify(draftRecord(userId, 10, workout('session-a'))));
    await openDraftStore({ indexedDB, storage });

    await createLocalDraftStore(storage).discard(userId, 'session-a', 30);
    const rebooted = await openDraftStore({ indexedDB, storage });

    expect(await rebooted.userIdsWithDrafts()).toEqual([]);
    expect(await rebooted.get(userId)).toMatchObject({ kind: 'discarded', discardedSessionId: 'session-a' });
  });

  it('retries IndexedDB on the next open instead of remembering a failed boot', async () => {
    const indexedDB = new IDBFactory();
    const database = await openDraftDatabase(indexedDB);
    await createIdbDraftStore(database!).put(userId, 20, workout('unsynced-in-idb'));
    database!.close();
    vi.stubGlobal('localStorage', new MemoryStorage());

    vi.stubGlobal('indexedDB', unopenableIndexedDb);
    await expect(openPrimaryDraftStore()).rejects.toThrow();
    expect(await (await openDraftStoreOrFallback()).get(userId)).toBeNull();

    vi.stubGlobal('indexedDB', indexedDB);
    expect(await (await openPrimaryDraftStore()).get(userId)).toMatchObject({
      kind: 'draft',
      draft: { sessionId: 'unsynced-in-idb' },
    });
  });

  it('remembers a failed IndexedDB open for the draft checks while the draft session keeps retrying', async () => {
    vi.resetModules();
    const boot = await import('../../web/src/offline/draft-boot.ts');
    vi.useFakeTimers();
    const open = vi.fn(() => ({}));
    vi.stubGlobal('indexedDB', { open });
    vi.stubGlobal('localStorage', new MemoryStorage());

    const firstCheck = boot.openDraftStoreOrFallback();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await (await firstCheck).get(userId)).toBeNull();
    expect(await (await boot.openDraftStoreOrFallback()).get(userId)).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);

    const sessionOpen = expect(boot.openPrimaryDraftStore()).rejects.toThrow();
    expect(open).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    await sessionOpen;
  });
});
