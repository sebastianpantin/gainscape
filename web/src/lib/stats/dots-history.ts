import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { loadStatCacheFirst } from '../../offline/stats-cache.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import { fetchBodyweightTrend } from '../progress/bodyweight-trend.ts';
import { queryProgressSets, sessionProgress } from '../progress/exercise-progress-rules.ts';
import { type DotsHistoryPoint, dotsHistory, dotsHistorySchema } from './strength-level-rules.ts';

export function loadDotsHistoryCacheFirst(
  userId: string,
  liftIds: readonly string[],
  signal: AbortSignal,
): Promise<CacheFirstLoad<DotsHistoryPoint[]>> {
  return loadStatCacheFirst(
    deviceStorage(),
    userId,
    { family: 'dots-history', entry: liftIds.join(',') },
    dotsHistorySchema,
    async () => {
      const [bodyweights, liftSets] = await Promise.all([
        fetchBodyweightTrend(userId, signal),
        Promise.all(liftIds.map((liftId) => queryProgressSets(supabase, liftId, signal))),
      ]);
      const sessionsByLift = new Map(
        liftIds.map((liftId, index) => [liftId, sessionProgress(liftSets[index], 'external')]),
      );
      return dotsHistory(sessionsByLift, bodyweights, DEFAULT_BALANCE.e1rmWindowDays);
    },
  );
}
