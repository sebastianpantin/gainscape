import { createLocalDraftStore, type DraftStore } from './draft-store.ts';

export async function hasUnsyncedDraft(store: DraftStore, userId: string): Promise<boolean> {
  return (await store.userIdsWithDrafts()).includes(userId);
}

export async function hasDraftOnDevice(store: DraftStore, storage: Storage | null, userId: string): Promise<boolean> {
  if (await hasUnsyncedDraft(store, userId)) return true;
  return storage !== null && hasUnsyncedDraft(createLocalDraftStore(storage), userId);
}

export async function forgetDraftOnDevice(store: DraftStore, storage: Storage | null, userId: string): Promise<void> {
  await store.forget(userId);
  if (storage !== null) await createLocalDraftStore(storage).forget(userId);
}

export async function otherAccountDraftIds(
  store: DraftStore,
  storage: Storage | null,
  userId: string,
): Promise<string[]> {
  const inFallback = storage === null ? [] : await createLocalDraftStore(storage).userIdsWithDrafts();
  const draftUserIds = new Set([...(await store.userIdsWithDrafts()), ...inFallback]);
  draftUserIds.delete(userId);
  return [...draftUserIds];
}

export async function forgetOtherAccountDrafts(
  store: DraftStore,
  storage: Storage | null,
  userId: string,
): Promise<void> {
  for (const otherUserId of await otherAccountDraftIds(store, storage, userId))
    await forgetDraftOnDevice(store, storage, otherUserId);
}
