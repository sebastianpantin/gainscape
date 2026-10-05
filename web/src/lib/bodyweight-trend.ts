import {
  BODYWEIGHT_LOAD_TYPES,
  BODYWEIGHT_TREND_COLUMNS,
  type BodyweightDay,
  type BodyweightEntryRow,
  bodyweightTrend,
  type WorkoutBodyweightRow,
} from './bodyweight-trend-rules.ts';
import { supabase } from './supabase.ts';

export async function fetchBodyweightTrend(userId: string, signal: AbortSignal): Promise<BodyweightDay[]> {
  const [entries, workoutSets] = await Promise.all([
    supabase
      .from('bodyweight_entries')
      .select(BODYWEIGHT_TREND_COLUMNS.entries)
      .eq('user_id', userId)
      .abortSignal(signal),
    supabase
      .from('sets')
      .select(BODYWEIGHT_TREND_COLUMNS.workoutSets)
      .eq('user_id', userId)
      .in('exercises.load_type', BODYWEIGHT_LOAD_TYPES)
      .abortSignal(signal),
  ]);
  if (entries.error) throw entries.error;
  if (workoutSets.error) throw workoutSets.error;
  return bodyweightTrend(
    entries.data as unknown as BodyweightEntryRow[],
    workoutSets.data as unknown as WorkoutBodyweightRow[],
  );
}
