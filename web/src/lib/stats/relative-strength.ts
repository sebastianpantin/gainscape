import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { loadStatCacheFirst } from '../../offline/stats-cache.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import { fetchBodyweightTrend } from '../progress/bodyweight-trend.ts';
import { queryProgressSets, sessionProgress } from '../progress/exercise-progress-rules.ts';
import {
  type RelativeStrengthPoint,
  relativeStrengthPoints,
  relativeStrengthPointsSchema,
} from './relative-strength-rules.ts';

export function loadRelativeStrengthCacheFirst(
  userId: string,
  exerciseId: string,
  signal: AbortSignal,
): Promise<CacheFirstLoad<RelativeStrengthPoint[]>> {
  return loadStatCacheFirst(
    deviceStorage(),
    userId,
    { family: 'relative-strength', entry: exerciseId },
    relativeStrengthPointsSchema,
    async () => {
      const [sets, bodyweights] = await Promise.all([
        queryProgressSets(supabase, exerciseId, signal),
        fetchBodyweightTrend(userId, signal),
      ]);
      return relativeStrengthPoints(sessionProgress(sets, 'external'), bodyweights);
    },
  );
}
