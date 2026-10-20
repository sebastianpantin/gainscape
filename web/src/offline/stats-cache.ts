import { z } from 'zod';
import { keyedStore } from '../lib/platform/keyed-store.ts';
import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline, userCache } from './cache-first.ts';

export const OFFLINE_STATS_NOTICE = 'Offline: showing your saved stats.';

export const SAVED_STAT_ENTRIES = {
  'training-days': 12,
  'relative-strength': 12,
  'weekly-exercise-sets': 1,
  'record-timeline': 1,
  'loot-stats': 1,
} as const;

export type StatFamily = keyof typeof SAVED_STAT_ENTRIES;

export const STAT_FAMILIES = Object.keys(SAVED_STAT_ENTRIES) as StatFamily[];

interface StatKey {
  family: StatFamily;
  entry: string;
}

type SavedEntries = Record<string, unknown>;

export function statFamilyCache(family: StatFamily) {
  return userCache<SavedEntries>(`gainscape.stats.v2.${family}.`, z.record(z.string(), z.unknown()));
}

const retiredSingleRecordCache = keyedStore('gainscape.stats.v1.', () => null);

function readSavedStat<Value>(
  storage: Storage | null,
  userId: string,
  { family, entry }: StatKey,
  schema: z.ZodType<Value>,
): Value | null {
  const parsed = schema.safeParse(statFamilyCache(family).read(storage, userId)?.[entry]);
  return parsed.success ? parsed.data : null;
}

function saveStat(storage: Storage | null, userId: string, { family, entry }: StatKey, value: unknown): void {
  const cache = statFamilyCache(family);
  const others = Object.entries(cache.read(storage, userId) ?? {}).filter(([savedEntry]) => savedEntry !== entry);
  const kept = [...others, [entry, value] as const].slice(-SAVED_STAT_ENTRIES[family]);
  cache.save(storage, userId, Object.fromEntries(kept));
  retiredSingleRecordCache.forget(storage, userId);
}

export function forgetStatsCache(storage: Storage | null, userId: string): void {
  for (const family of STAT_FAMILIES) statFamilyCache(family).forget(storage, userId);
  retiredSingleRecordCache.forget(storage, userId);
}

export function loadStatCacheFirst<Value>(
  storage: Storage | null,
  userId: string,
  key: StatKey,
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
