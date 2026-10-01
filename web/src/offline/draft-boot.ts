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
import { parseStoredDraft } from './draft-format.ts';

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
  const transaction = database.transaction(DRAFT_OBJECT_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const objectStore = transaction.objectStore(DRAFT_OBJECT_STORE);
  const request = objectStore.get(userId);
  request.onsuccess = () => {
    const stored = parseStoredDraft(request.result, userId);
    if (fallback && (!stored || fallback.updatedAt > stored.updatedAt)) objectStore.put(fallback);
  };
  await done;
  storage.removeItem(fallbackKeyFor(userId));
}

export async function openDraftStore(environment: DraftEnvironment): Promise<DraftStore> {
  deleteV1Drafts(environment.storage);
  const database = environment.indexedDB ? await openDraftDatabase(environment.indexedDB) : null;
  if (!database) return createLocalDraftStore(environment.storage);
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

export function openDraftStoreAndReconcile(): Promise<DraftStore> {
  bootedStore ??= openDraftStore({ indexedDB: browserIndexedDb(), storage: localStorage });
  return bootedStore;
}
