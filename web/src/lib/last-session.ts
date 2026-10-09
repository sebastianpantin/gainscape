import { type RecentSet, recentSessionsByExercise, type RecentLiftRow } from './last-session-rules.ts';
import { supabase } from './supabase.ts';

const RECENT_SESSION_COUNT = 3;

export async function fetchRecentLiftSessions(
  exerciseIds: string[],
  signal: AbortSignal,
): Promise<Map<string, RecentSet[][]>> {
  const { data, error } = await supabase
    .rpc('recent_lift_sets', { exercise_ids: exerciseIds, session_count: RECENT_SESSION_COUNT })
    .abortSignal(signal);
  if (error) throw error;
  return recentSessionsByExercise(data as RecentLiftRow[]);
}
