import { type ExerciseNotes, queryExerciseNotes, saveExerciseNoteWith } from './exercise-note-rules.ts';
import { withFriendlyRateLimit } from './rate-limit.ts';
import { supabase } from './supabase.ts';

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
