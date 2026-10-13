import { type ExerciseNotes, queryExerciseNotes, saveExerciseNoteWith } from './exercise-note-rules.ts';
import { withFriendlyRateLimit } from '../platform/rate-limit.ts';
import { supabase } from '../platform/supabase.ts';

export function fetchExerciseNotes(): Promise<ExerciseNotes> {
  return queryExerciseNotes(supabase);
}

export async function saveExerciseNote(exerciseId: string, body: string): Promise<string | null> {
  try {
    return await saveExerciseNoteWith(supabase, exerciseId, body);
  } catch (error) {
    throw withFriendlyRateLimit(error);
  }
}
