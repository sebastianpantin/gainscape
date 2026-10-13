import { type DraftChannel } from './draft-session.ts';
import { createLocalDraftStore, type DraftStore } from './draft-store.ts';

export async function hasUnsyncedDraft(store: DraftStore, userId: string): Promise<boolean> {
  return (await store.userIdsWithDrafts()).includes(userId);
}

export async function hasDraftOnDevice(store: DraftStore, storage: Storage | null, userId: string): Promise<boolean> {
  if (await hasUnsyncedDraft(store, userId)) return true;
  return storage !== null && hasUnsyncedDraft(createLocalDraftStore(storage), userId);
}

async function announceForgottenDraft(
  stores: DraftStore[],
  userId: string,
  channel: Pick<DraftChannel, 'postMessage'>,
): Promise<void> {
  const records = await Promise.all(stores.map((store) => store.get(userId).catch(() => null)));
  for (const record of records)
    if (record?.kind === 'forgotten')
      channel.postMessage({
        userId,
        sessionId: record.forgottenSessionId,
        updatedAt: record.updatedAt,
        change: 'discarded',
      });
}

export async function forgetDraftOnDevice(
  store: DraftStore,
  storage: Storage | null,
  userId: string,
  channel: Pick<DraftChannel, 'postMessage'> | null = null,
): Promise<void> {
  const stores = storage === null ? [store] : [store, createLocalDraftStore(storage)];
  for (const each of stores) await each.forget(userId);
  if (channel !== null) await announceForgottenDraft(stores, userId, channel);
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
