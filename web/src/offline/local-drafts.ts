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
