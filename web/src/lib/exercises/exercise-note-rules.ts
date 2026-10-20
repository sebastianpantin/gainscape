import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parsedRows } from '../rows.ts';

export const EXERCISE_NOTE_MAX_LENGTH = 500;
export const EXERCISE_NOTE_OFFLINE_TEXT = 'Notes can be edited when you are online.';
const EXERCISE_NOTE_COLUMNS = 'exercise_id, body';

const exerciseNoteRowSchema = z.object({ exercise_id: z.string(), body: z.string() });

type ExerciseNoteRow = z.infer<typeof exerciseNoteRowSchema>;

export type ExerciseNotes = Readonly<Record<string, string>>;

export function toExerciseNotes(rows: readonly ExerciseNoteRow[]): ExerciseNotes {
  return Object.fromEntries(rows.map((row) => [row.exercise_id, row.body]));
}

const NOTE_EDGE_WHITESPACE = /^[\s\u0085]+|[\s\u0085]+$/g;

export function trimNote(body: string): string {
  return body.replace(NOTE_EDGE_WHITESPACE, '');
}

export function noteChanged(saved: string | undefined, draft: string): boolean {
  return trimNote(draft) !== (saved ?? '');
}

export function withNote(notes: ExerciseNotes, exerciseId: string, body: string | null): ExerciseNotes {
  const others = Object.fromEntries(Object.entries(notes).filter(([id]) => id !== exerciseId));
  return body ? { ...others, [exerciseId]: body } : others;
}

export type LocalNoteSaves = Readonly<Record<string, string | null>>;

export function withLocalSaves(notes: ExerciseNotes, saves: LocalNoteSaves): ExerciseNotes {
  return Object.entries(saves).reduce((merged, [exerciseId, body]) => withNote(merged, exerciseId, body), notes);
}

export function noteActionLabel(note: string | undefined): string {
  return note ? 'Edit note' : 'Add note';
}

export async function queryExerciseNotes(client: SupabaseClient): Promise<ExerciseNotes> {
  const { data, error } = await client.from('exercise_notes').select(EXERCISE_NOTE_COLUMNS);
  if (error) throw error;
  return toExerciseNotes(parsedRows(exerciseNoteRowSchema, data));
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
