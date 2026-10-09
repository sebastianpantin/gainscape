import {
  createIdbDraftStore,
  createLocalDraftStore,
  DRAFT_OBJECT_STORE,
  type DraftStore,
  fallbackKeyFor,
  fallbackUserIds,
  openDraftDatabase,
  readFallbackRecord,
  transactionDone,
} from './draft-store.ts';
import { parseStoredDraft, storedSessionId } from './draft-format.ts';

const V1_DRAFT_KEY = /^gainscape\.workout-draft\.[0-9a-f-]{36}$/;

export interface DraftEnvironment {
  indexedDB: IDBFactory | undefined;
  storage: Storage;
}

function deleteV1Drafts(storage: Storage): void {
  const v1Keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null && V1_DRAFT_KEY.test(key)) v1Keys.push(key);
  }
  for (const key of v1Keys) storage.removeItem(key);
}

async function moveFallbackRecord(database: IDBDatabase, storage: Storage, userId: string): Promise<void> {
  const fallback = readFallbackRecord(storage, userId);
  let keepFallback = false;
  const transaction = database.transaction(DRAFT_OBJECT_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const objectStore = transaction.objectStore(DRAFT_OBJECT_STORE);
  const request = objectStore.get(userId);
  request.onsuccess = () => {
    const stored = parseStoredDraft(request.result, userId);
    if (!fallback) return;
    const storesOtherSession = stored !== null && storedSessionId(stored) !== storedSessionId(fallback);
    keepFallback = storesOtherSession && stored.kind === 'draft';
    const fallbackIsOnlyCopy = storesOtherSession && fallback.kind === 'draft';
    if (!keepFallback && (!stored || fallbackIsOnlyCopy || fallback.updatedAt > stored.updatedAt))
      objectStore.put(fallback);
  };
  await done;
  const fallbackUnchanged = JSON.stringify(readFallbackRecord(storage, userId)) === JSON.stringify(fallback);
  if (!keepFallback && fallbackUnchanged) storage.removeItem(fallbackKeyFor(userId));
}

export async function openDraftStore(environment: DraftEnvironment): Promise<DraftStore> {
  deleteV1Drafts(environment.storage);
  if (!environment.indexedDB) return createLocalDraftStore(environment.storage);
  const database = await openDraftDatabase(environment.indexedDB);
  if (!database) throw new Error('draft_database_unavailable');
  for (const userId of fallbackUserIds(environment.storage))
    await moveFallbackRecord(database, environment.storage, userId).catch(() => undefined);
  return createIdbDraftStore(database);
}

function browserIndexedDb(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB;
  } catch {
    return undefined;
  }
}

let bootedStore: Promise<DraftStore> | null = null;

export function openPrimaryDraftStore(): Promise<DraftStore> {
  bootedStore ??= openDraftStore({ indexedDB: browserIndexedDb(), storage: localStorage }).catch((error: unknown) => {
    bootedStore = null;
    throw error;
  });
  return bootedStore;
}

export function openDraftStoreAndReconcile(): Promise<DraftStore> {
  return openPrimaryDraftStore().catch(() => createLocalDraftStore(localStorage));
}
