import { storedSessionId } from './draft-format.ts';
import { createLocalDraftStore, type DraftStore } from './draft-store.ts';

export async function hasUnsyncedDraft(store: DraftStore, userId: string): Promise<boolean> {
  return (await store.userIdsWithDrafts()).includes(userId);
}

export async function discardLocalDraft(store: DraftStore, userId: string): Promise<void> {
  const record = await store.get(userId);
  if (record) await store.discard(userId, storedSessionId(record));
}

export async function hasDraftOnDevice(store: DraftStore, storage: Storage | null, userId: string): Promise<boolean> {
  if (await hasUnsyncedDraft(store, userId)) return true;
  return storage !== null && hasUnsyncedDraft(createLocalDraftStore(storage), userId);
}
