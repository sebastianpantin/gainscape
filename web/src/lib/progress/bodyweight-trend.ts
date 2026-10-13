import {
  BODYWEIGHT_ENTRY_COLUMNS,
  type BodyweightDay,
  type BodyweightEntryRow,
  bodyweightTrend,
  type WorkoutBodyweightRow,
} from './bodyweight-trend-rules.ts';
import { supabase } from '../platform/supabase.ts';

export async function fetchBodyweightTrend(userId: string, signal: AbortSignal): Promise<BodyweightDay[]> {
  const [entries, workoutDays] = await Promise.all([
    supabase
      .from('bodyweight_entries')
      .select(BODYWEIGHT_ENTRY_COLUMNS)
      .eq('user_id', userId)
      .order('logged_on', { ascending: false })
      .abortSignal(signal),
    supabase.rpc('workout_bodyweights').order('local_date', { ascending: false }).abortSignal(signal),
  ]);
  if (entries.error) throw entries.error;
  if (workoutDays.error) throw workoutDays.error;
  return bodyweightTrend(
    entries.data as unknown as BodyweightEntryRow[],
    workoutDays.data as unknown as WorkoutBodyweightRow[],
  );
}
