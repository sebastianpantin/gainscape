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

let nextOffline: Promise<void> | null = null;

export function nextOfflineEvent(): Promise<void> {
  if (typeof window === 'undefined') return new Promise(() => undefined);
  nextOffline ??= new Promise((resolve) =>
    window.addEventListener(
      'offline',
      () => {
        nextOffline = null;
        resolve();
      },
      { once: true },
    ),
  );
  return nextOffline;
}

export function failFastWhenOffline(isOffline: () => boolean = isDeviceOffline): void {
  if (isOffline()) throw new OfflineError();
}

export interface CacheFirstLoad<Loaded> {
  loaded: Loaded;
  fromCache: boolean;
}

export async function loadCacheFirstWhenOffline<Loaded>(
  isOffline: () => boolean,
  loadSaved: () => Loaded | null,
  loadLive: () => Promise<Loaded>,
  wentOffline: Promise<void> = nextOfflineEvent(),
): Promise<CacheFirstLoad<Loaded>> {
  if (isOffline()) {
    const saved = loadSaved();
    if (saved) return { loaded: saved, fromCache: true };
    throw new OfflineError();
  }
  try {
    const offlineMidLoad = wentOffline.then(() => Promise.reject(new OfflineError()));
    return { loaded: await Promise.race([loadLive(), offlineMidLoad]), fromCache: false };
  } catch (error) {
    const saved = loadSaved();
    if (saved) return { loaded: saved, fromCache: true };
    throw error;
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
