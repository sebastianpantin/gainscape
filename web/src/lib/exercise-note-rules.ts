import type { SupabaseClient } from '@supabase/supabase-js';

export const EXERCISE_NOTE_MAX_LENGTH = 500;
export const EXERCISE_NOTE_OFFLINE_TEXT = 'Notes can be edited when you are online.';
export const EXERCISE_NOTE_COLUMNS = 'exercise_id, body';

export interface ExerciseNoteRow {
  exercise_id: string;
  body: string;
}

export type ExerciseNotes = Readonly<Record<string, string>>;

export function toExerciseNotes(rows: readonly ExerciseNoteRow[]): ExerciseNotes {
  return Object.fromEntries(rows.map((row) => [row.exercise_id, row.body]));
}

export function noteChanged(saved: string | undefined, draft: string): boolean {
  return draft.trim() !== (saved ?? '');
}

export function withNote(notes: ExerciseNotes, exerciseId: string, body: string | null): ExerciseNotes {
  const others = Object.fromEntries(Object.entries(notes).filter(([id]) => id !== exerciseId));
  return body ? { ...others, [exerciseId]: body } : others;
}

export function noteActionLabel(note: string | undefined): string {
  return note ? 'Edit note' : 'Add note';
}

export async function queryExerciseNotes(client: SupabaseClient): Promise<ExerciseNotes> {
  const { data, error } = await client.from('exercise_notes').select(EXERCISE_NOTE_COLUMNS);
  if (error) throw error;
  return toExerciseNotes(data as ExerciseNoteRow[]);
}

export async function saveExerciseNoteWith(
  client: SupabaseClient,
  exerciseId: string,
  body: string,
): Promise<string | null> {
  const { data, error } = await client.rpc('save_exercise_note', { exercise_id: exerciseId, body });
  if (error) throw error;
  return data as string | null;
}
