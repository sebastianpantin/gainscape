import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { loadStatCacheFirst } from '../../offline/stats-cache.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import {
  queryTrainingDays,
  type TrainingSession,
  trainingDayRowsSchema,
  trainingSessionOf,
} from './training-days-rules.ts';

export async function loadTrainingDaysCacheFirst(
  userId: string,
  month: string,
  signal: AbortSignal,
): Promise<CacheFirstLoad<TrainingSession[]>> {
  const load = await loadStatCacheFirst(deviceStorage(), userId, `training-days:${month}`, trainingDayRowsSchema, () =>
    queryTrainingDays(supabase, month, signal),
  );
  return { ...load, loaded: load.loaded.map(trainingSessionOf) };
}
