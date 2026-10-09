import { z } from 'zod';

export const OFFLINE_PROBLEM = 'Offline: connect to load this screen.';

export class OfflineError extends Error {
  constructor() {
    super(OFFLINE_PROBLEM);
    this.name = 'OfflineError';
  }
}

export function isDeviceOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export type SubscribeOffline = (onOffline: () => void) => () => void;

function subscribeToOfflineEvent(onOffline: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('offline', onOffline);
  return () => window.removeEventListener('offline', onOffline);
}

const NETWORK_ERROR_NAMES = new Set(['AbortError', 'TimeoutError', 'OfflineError']);
const NETWORK_ERROR_MESSAGE = /Failed to fetch|NetworkError|Load failed|AbortError|TimeoutError|aborted/i;

export function isNetworkError(error: unknown): boolean {
  const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown };
  return (
    (typeof name === 'string' && NETWORK_ERROR_NAMES.has(name)) ||
    (typeof message === 'string' && NETWORK_ERROR_MESSAGE.test(message))
  );
}

function problemOf(error: unknown): string {
  const { message } = (error ?? {}) as { message?: unknown };
  return typeof message === 'string' && message !== '' ? message : 'Something went wrong.';
}

export function savedCopyNotice(problem: string): string {
  return `Showing your saved copy. Couldn't refresh: ${problem}`;
}

export function failFastWhenOffline(isOffline: () => boolean = isDeviceOffline): void {
  if (isOffline()) throw new OfflineError();
}

export type CacheFirstLoad<Loaded> =
  | { loaded: Loaded; fromCache: false }
  | { loaded: Loaded; fromCache: true; offline: true }
  | { loaded: Loaded; fromCache: true; offline: false; problem: string };

export function cacheFirstNotice(load: CacheFirstLoad<unknown>, offlineNotice: string): string | null {
  if (!load.fromCache) return null;
  return load.offline ? offlineNotice : savedCopyNotice(load.problem);
}

function liveUnlessOffline<Loaded>(loadLive: () => Promise<Loaded>, subscribeOffline: SubscribeOffline) {
  let unsubscribe: () => void = () => undefined;
  const loading = new Promise<Loaded>((resolve, reject) => {
    unsubscribe = subscribeOffline(() => reject(new OfflineError()));
    loadLive().then(resolve, reject);
  });
  return loading.finally(() => unsubscribe());
}

export async function loadCacheFirstWhenOffline<Loaded>(
  isOffline: () => boolean,
  loadSaved: () => Loaded | null,
  loadLive: () => Promise<Loaded>,
  subscribeOffline: SubscribeOffline = subscribeToOfflineEvent,
): Promise<CacheFirstLoad<Loaded>> {
  if (isOffline()) {
    const saved = loadSaved();
    if (saved) return { loaded: saved, fromCache: true, offline: true };
    throw new OfflineError();
  }
  try {
    return { loaded: await liveUnlessOffline(loadLive, subscribeOffline), fromCache: false };
  } catch (error) {
    const saved = loadSaved();
    if (!saved) throw error;
    return isOffline() || isNetworkError(error)
      ? { loaded: saved, fromCache: true, offline: true }
      : { loaded: saved, fromCache: true, offline: false, problem: problemOf(error) };
  }
}

export interface UserCache<Value> {
  read(storage: Storage | null, userId: string): Value | null;
  save(storage: Storage | null, userId: string, value: Value): void;
  forget(storage: Storage | null, userId: string): void;
}

export function userCache<Value>(keyPrefix: string, valueSchema: z.ZodType<Value>): UserCache<Value> {
  const keyFor = (userId: string) => `${keyPrefix}${userId}`;
  const recordSchema = z.object({ userId: z.string(), value: valueSchema });
  return {
    read(storage, userId) {
      try {
        const raw = storage?.getItem(keyFor(userId));
        if (!raw) return null;
        const parsed = recordSchema.safeParse(JSON.parse(raw));
        if (!parsed.success || parsed.data.userId !== userId) return null;
        return parsed.data.value as Value;
      } catch {
        return null;
      }
    },
    save(storage, userId, value) {
      try {
        storage?.setItem(keyFor(userId), JSON.stringify({ userId, value }));
      } catch {
        return;
      }
    },
    forget(storage, userId) {
      try {
        storage?.removeItem(keyFor(userId));
      } catch {
        return;
      }
    },
  };
}
