import { z } from 'zod';
import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline, userCache } from './cache-first.ts';

export const OFFLINE_STATS_NOTICE = 'Offline: showing your saved stats.';

export const MAX_SAVED_STATS = 24;

type SavedStats = Record<string, unknown>;

export const statsCache = userCache<SavedStats>('gainscape.stats.v1.', z.record(z.string(), z.unknown()));

function readSavedStat<Value>(
  storage: Storage | null,
  userId: string,
  key: string,
  schema: z.ZodType<Value>,
): Value | null {
  const parsed = schema.safeParse(statsCache.read(storage, userId)?.[key]);
  return parsed.success ? parsed.data : null;
}

function saveStat(storage: Storage | null, userId: string, key: string, value: unknown): void {
  const others = Object.entries(statsCache.read(storage, userId) ?? {}).filter(([savedKey]) => savedKey !== key);
  const kept = [...others, [key, value] as const].slice(-MAX_SAVED_STATS);
  statsCache.save(storage, userId, Object.fromEntries(kept));
}

export function loadStatCacheFirst<Value>(
  storage: Storage | null,
  userId: string,
  key: string,
  schema: z.ZodType<Value>,
  loadLive: () => Promise<Value>,
  isOffline: () => boolean = isDeviceOffline,
): Promise<CacheFirstLoad<Value>> {
  return loadCacheFirstWhenOffline(
    isOffline,
    () => readSavedStat(storage, userId, key, schema),
    async () => {
      const value = await loadLive();
      saveStat(storage, userId, key, value);
      return value;
    },
  );
}
