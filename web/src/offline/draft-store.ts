import {
  draftRecord,
  parseStoredDraft,
  type StoredDraft,
  storedSessionId,
  syncedRecord,
  type WorkoutDraft,
} from './draft-format.ts';

export type PutResult = 'written' | 'stale' | 'synced' | 'refused_reopen';

export interface PutOptions {
  reopen?: boolean;
}

export interface DraftStore {
  get(userId: string): Promise<StoredDraft | null>;
  put(userId: string, updatedAt: number, draft: WorkoutDraft, options?: PutOptions): Promise<PutResult>;
  markSynced(userId: string, sessionId: string, updatedAt: number): Promise<void>;
  discard(userId: string, sessionId: string): Promise<void>;
  userIdsWithDrafts(): Promise<string[]>;
}

const DRAFT_DATABASE_NAME = 'gainscape';
export const DRAFT_OBJECT_STORE = 'drafts';
const FALLBACK_KEY_PREFIX = 'gainscape.workout-draft.v2.';
const DRAFT_DATABASE_VERSION = 1;
const OPEN_TIMEOUT_MS = 2000;

function decidePut(
  stored: StoredDraft | null,
  updatedAt: number,
  draft: WorkoutDraft,
  options: PutOptions | undefined,
): PutResult {
  if (stored?.kind === 'synced' && stored.syncedSessionId === draft.sessionId) return 'synced';
  const reopening =
    stored?.kind === 'draft' &&
    stored.draft.sessionId === draft.sessionId &&
    stored.draft.finishedAt !== null &&
    draft.finishedAt === null;
  if (reopening && !options?.reopen) return 'refused_reopen';
  if (stored && updatedAt < stored.updatedAt) return 'stale';
  return 'written';
}

function tombstoneFor(stored: StoredDraft | null, userId: string, sessionId: string, updatedAt: number) {
  if (stored?.kind !== 'draft' || stored.draft.sessionId !== sessionId) return null;
  return syncedRecord(userId, Math.max(updatedAt, stored.updatedAt + 1), sessionId);
}

function matchesSession(stored: StoredDraft | null, sessionId: string): boolean {
  return stored !== null && storedSessionId(stored) === sessionId;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('transaction_aborted'));
  });
  done.catch(() => undefined);
  return done;
}

export function openDraftDatabase(factory: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(database);
    };
    const timer = setTimeout(() => settle(null), OPEN_TIMEOUT_MS);
    try {
      const request = factory.open(DRAFT_DATABASE_NAME, DRAFT_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DRAFT_OBJECT_STORE))
          request.result.createObjectStore(DRAFT_OBJECT_STORE, { keyPath: 'userId' });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        settle(database);
      };
      request.onerror = () => settle(null);
      request.onblocked = () => settle(null);
    } catch {
      settle(null);
    }
  });
}

export function createIdbDraftStore(database: IDBDatabase): DraftStore {
  const readStored = async (objectStore: IDBObjectStore, userId: string) =>
    parseStoredDraft(await requestResult(objectStore.get(userId)), userId);

  const inTransaction = async <T>(
    mode: IDBTransactionMode,
    work: (objectStore: IDBObjectStore) => Promise<T>,
  ): Promise<T> => {
    const transaction = database.transaction(DRAFT_OBJECT_STORE, mode);
    const done = transactionDone(transaction);
    const result = await work(transaction.objectStore(DRAFT_OBJECT_STORE));
    await done;
    return result;
  };

  return {
    get: (userId) => inTransaction('readonly', (objectStore) => readStored(objectStore, userId)),
    put: (userId, updatedAt, draft, options) =>
      inTransaction('readwrite', async (objectStore) => {
        const result = decidePut(await readStored(objectStore, userId), updatedAt, draft, options);
        if (result === 'written') objectStore.put(draftRecord(userId, updatedAt, draft));
        return result;
      }),
    markSynced: (userId, sessionId, updatedAt) =>
      inTransaction('readwrite', async (objectStore) => {
        const tombstone = tombstoneFor(await readStored(objectStore, userId), userId, sessionId, updatedAt);
        if (tombstone) objectStore.put(tombstone);
      }),
    discard: (userId, sessionId) =>
      inTransaction('readwrite', async (objectStore) => {
        if (matchesSession(await readStored(objectStore, userId), sessionId)) objectStore.delete(userId);
      }),
    userIdsWithDrafts: () =>
      inTransaction('readonly', async (objectStore) => {
        const records: unknown[] = await requestResult(objectStore.getAll());
        return records.flatMap((record) => {
          const userId = (record as { userId?: unknown }).userId;
          if (typeof userId !== 'string') return [];
          return parseStoredDraft(record, userId)?.kind === 'draft' ? [userId] : [];
        });
      }),
  };
}

export function fallbackKeyFor(userId: string): string {
  return `${FALLBACK_KEY_PREFIX}${userId}`;
}

export function readFallbackRecord(storage: Storage, userId: string): StoredDraft | null {
  try {
    const raw = storage.getItem(fallbackKeyFor(userId));
    return raw === null ? null : parseStoredDraft(JSON.parse(raw), userId);
  } catch {
    return null;
  }
}

export function createLocalDraftStore(storage: Storage): DraftStore {
  const write = (record: StoredDraft) => storage.setItem(fallbackKeyFor(record.userId), JSON.stringify(record));

  return {
    get: async (userId) => readFallbackRecord(storage, userId),
    put: async (userId, updatedAt, draft, options) => {
      const result = decidePut(readFallbackRecord(storage, userId), updatedAt, draft, options);
      if (result === 'written') write(draftRecord(userId, updatedAt, draft));
      return result;
    },
    markSynced: async (userId, sessionId, updatedAt) => {
      const tombstone = tombstoneFor(readFallbackRecord(storage, userId), userId, sessionId, updatedAt);
      if (tombstone) write(tombstone);
    },
    discard: async (userId, sessionId) => {
      if (matchesSession(readFallbackRecord(storage, userId), sessionId)) storage.removeItem(fallbackKeyFor(userId));
    },
    userIdsWithDrafts: async () =>
      fallbackUserIds(storage).filter((userId) => readFallbackRecord(storage, userId)?.kind === 'draft'),
  };
}

export function fallbackUserIds(storage: Storage): string[] {
  const userIds: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(FALLBACK_KEY_PREFIX)) userIds.push(key.slice(FALLBACK_KEY_PREFIX.length));
  }
  return userIds;
}
