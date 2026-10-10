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
import { parseStoredDraft, storableRecord, type StoredDraft, storedSessionId } from './draft-format.ts';
import { SESSION_STAYS_ON_FALLBACK } from './draft-session.ts';

const V1_DRAFT_KEY = /^gainscape\.workout-draft\.[0-9a-f-]{36}$/;
const FORGOTTEN_TOMBSTONE_LIFETIME_MS = 24 * 60 * 60 * 1000;

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

function isExpiredForgottenTombstone(record: StoredDraft | null, now: number): boolean {
  return record?.kind === 'forgotten' && now - record.updatedAt >= FORGOTTEN_TOMBSTONE_LIFETIME_MS;
}

function dropExpiredFallbackTombstones(storage: Storage, now: number): void {
  for (const userId of fallbackUserIds(storage))
    if (isExpiredForgottenTombstone(readFallbackRecord(storage, userId), now))
      storage.removeItem(fallbackKeyFor(userId));
}

async function dropExpiredStoredTombstones(database: IDBDatabase, now: number): Promise<void> {
  const transaction = database.transaction(DRAFT_OBJECT_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const request = transaction.objectStore(DRAFT_OBJECT_STORE).openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (isExpiredForgottenTombstone(parseStoredDraft(cursor.value, String(cursor.key)), now)) cursor.delete();
    cursor.continue();
  };
  await done;
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
      objectStore.put(storableRecord(fallback));
  };
  await done;
  const fallbackUnchanged = JSON.stringify(readFallbackRecord(storage, userId)) === JSON.stringify(fallback);
  if (!keepFallback && fallbackUnchanged) storage.removeItem(fallbackKeyFor(userId));
}

export async function openDraftStore(environment: DraftEnvironment): Promise<DraftStore> {
  const now = Date.now();
  deleteV1Drafts(environment.storage);
  if (!environment.indexedDB) {
    dropExpiredFallbackTombstones(environment.storage, now);
    return createLocalDraftStore(environment.storage);
  }
  const database = await openDraftDatabase(environment.indexedDB);
  if (!database) throw new Error('draft_database_unavailable');
  for (const userId of fallbackUserIds(environment.storage))
    await moveFallbackRecord(database, environment.storage, userId).catch(() => undefined);
  await dropExpiredStoredTombstones(database, now).catch(() => undefined);
  dropExpiredFallbackTombstones(environment.storage, now);
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
let bootFailedThisLoad = false;

export function openPrimaryDraftStore(): Promise<DraftStore> {
  bootedStore ??= openDraftStore({ indexedDB: browserIndexedDb(), storage: localStorage }).catch((error: unknown) => {
    bootedStore = null;
    bootFailedThisLoad = true;
    throw error;
  });
  return bootedStore;
}

export async function openDraftStoreOrFallback(): Promise<DraftStore> {
  if (bootFailedThisLoad && bootedStore === null) return createLocalDraftStore(localStorage);
  return openPrimaryDraftStore().catch(() => createLocalDraftStore(localStorage));
}

let sessionWroteFallbackThisLoad = false;

export function openDraftSessionStore(): Promise<DraftStore> {
  if (sessionWroteFallbackThisLoad) return Promise.reject(new Error(SESSION_STAYS_ON_FALLBACK));
  return openPrimaryDraftStore();
}

export function openDraftSessionFallback(): DraftStore {
  const fallback = createLocalDraftStore(localStorage);
  return {
    ...fallback,
    put: async (...args) => {
      const result = await fallback.put(...args);
      if (result === 'written') sessionWroteFallbackThisLoad = true;
      return result;
    },
  };
}
