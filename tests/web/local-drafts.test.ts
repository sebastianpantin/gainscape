import { describe, expect, it } from 'vitest';
import { createLocalDraftStore } from '../../web/src/offline/draft-store.ts';
import { forgetDraftOnDevice, hasDraftOnDevice, hasUnsyncedDraft } from '../../web/src/offline/local-drafts.ts';
import { workout } from './draft-store.contract.ts';
import { MemoryStorage } from './memory-storage.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';

describe('local drafts of an account', () => {
  it('knows whether the account has a workout that has not synced', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    expect(await hasUnsyncedDraft(store, userId)).toBe(false);
    await store.put(userId, 10, workout('session-a'));
    await store.put(otherUserId, 10, workout('session-b'));
    expect(await hasUnsyncedDraft(store, userId)).toBe(true);
  });

  it('sees a draft of the account in the given store', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 10, workout('session-a'));
    expect(await hasDraftOnDevice(store, new MemoryStorage(), userId)).toBe(true);
  });

  it('sees a draft that only the localStorage fallback holds', async () => {
    const storage = new MemoryStorage();
    await createLocalDraftStore(storage).put(userId, 10, workout('session-a'));
    const emptyStore = createLocalDraftStore(new MemoryStorage());
    expect(await hasDraftOnDevice(emptyStore, storage, userId)).toBe(true);
  });

  it('forgets the account record in both the given store and the localStorage fallback, leaving no tombstone', async () => {
    const storage = new MemoryStorage();
    await createLocalDraftStore(storage).put(userId, 10, workout('session-in-fallback'));
    await createLocalDraftStore(storage).put(otherUserId, 10, workout('session-b'));
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 10, workout('session-a'));
    await forgetDraftOnDevice(store, storage, userId);
    expect(await store.get(userId)).toBeNull();
    expect(await createLocalDraftStore(storage).get(userId)).toBeNull();
    expect(await hasDraftOnDevice(store, storage, otherUserId)).toBe(true);
    await expect(forgetDraftOnDevice(store, null, userId)).resolves.toBeUndefined();
  });

  it('ignores drafts of other accounts and synced workouts', async () => {
    const storage = new MemoryStorage();
    const fallback = createLocalDraftStore(storage);
    await fallback.put(otherUserId, 10, workout('session-b'));
    await fallback.put(userId, 10, workout('session-a', '2026-09-30T11:00:00.000Z'));
    await fallback.markSynced(userId, 'session-a', 11);
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(otherUserId, 10, workout('session-c'));
    expect(await hasDraftOnDevice(store, storage, userId)).toBe(false);
    expect(await hasDraftOnDevice(store, null, userId)).toBe(false);
  });
});
