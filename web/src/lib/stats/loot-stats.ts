import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { loadStatCacheFirst } from '../../offline/stats-cache.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import { type LootStatsRow, lootStatsRowSchema, queryLootStats } from './loot-stats-rules.ts';

export function loadLootStatsCacheFirst(userId: string, signal: AbortSignal): Promise<CacheFirstLoad<LootStatsRow>> {
  return loadStatCacheFirst(deviceStorage(), userId, 'loot-stats', lootStatsRowSchema, () =>
    queryLootStats(supabase, signal),
  );
}
