import { fetchExercises } from '../../lib/exercises/catalog.ts';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { fetchSession, fetchSessionSets } from '../../lib/history/history.ts';
import { type SessionDetail, type StoredSetRow } from '../../lib/history/history-rules.ts';
import { editFromSession, type SessionEdit } from './session-edit.ts';

export interface Loaded {
  session: SessionDetail;
  sets: StoredSetRow[];
  exercises: Exercise[];
  original: SessionEdit;
  xpBasis: SessionEdit;
}

export async function loadSession(sessionId: string): Promise<Loaded | null> {
  const [session, sets, exercises] = await Promise.all([
    fetchSession(sessionId),
    fetchSessionSets(sessionId),
    fetchExercises({ includeArchived: true }),
  ]);
  if (!session) return null;
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const original = editFromSession(session, sets, exercisesById);
  return { session, sets, exercises, original, xpBasis: original };
}
