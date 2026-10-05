import type { LastLoggedSet } from '../offline/draft-format.ts';
import { lastSessionByExercise, type LastSessionRow } from './last-session-rules.ts';
import { supabase } from './supabase.ts';

export async function fetchLastSessionSets(
  exerciseIds: string[],
  signal: AbortSignal,
): Promise<Map<string, LastLoggedSet[]>> {
  const { data, error } = await supabase.rpc('last_session_sets', { exercise_ids: exerciseIds }).abortSignal(signal);
  if (error) throw error;
  return lastSessionByExercise(data as LastSessionRow[]);
}
