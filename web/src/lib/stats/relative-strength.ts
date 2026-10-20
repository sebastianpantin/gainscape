import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { loadStatCacheFirst } from '../../offline/stats-cache.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import { fetchBodyweightTrend } from '../progress/bodyweight-trend.ts';
import { queryProgressSets } from '../progress/exercise-progress-rules.ts';
import { type RelativeStrengthData, relativeStrengthDataSchema } from './relative-strength-rules.ts';

export function loadRelativeStrengthCacheFirst(
  userId: string,
  exerciseId: string,
  signal: AbortSignal,
): Promise<CacheFirstLoad<RelativeStrengthData>> {
  return loadStatCacheFirst(
    deviceStorage(),
    userId,
    `relative-strength:${exerciseId}`,
    relativeStrengthDataSchema,
    async () => {
      const [sets, bodyweights] = await Promise.all([
        queryProgressSets(supabase, exerciseId, signal),
        fetchBodyweightTrend(userId, signal),
      ]);
      return { sets, bodyweights };
    },
  );
}
