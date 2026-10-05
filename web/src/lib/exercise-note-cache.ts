import { z } from 'zod';
import type { ExerciseNotes } from './exercise-note-rules.ts';

const CACHE_VERSION = 1;
const CACHE_KEY_PREFIX = 'gainscape.exercise-notes.v1.';

const cachedNotesSchema = z.object({
  v: z.literal(CACHE_VERSION),
  savedAt: z.string(),
  userId: z.string(),
  notes: z.record(z.string(), z.string()),
});

export function exerciseNotesCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

export function readCachedExerciseNotes(storage: Storage, userId: string): ExerciseNotes | null {
  try {
    const raw = storage.getItem(exerciseNotesCacheKey(userId));
    if (!raw) return null;
    const parsed = cachedNotesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.userId !== userId) return null;
    return parsed.data.notes;
  } catch {
    return null;
  }
}

export function saveCachedExerciseNotes(
  storage: Storage,
  userId: string,
  notes: ExerciseNotes,
  now = new Date(),
): void {
  const record = { v: CACHE_VERSION, savedAt: now.toISOString(), userId, notes };
  try {
    storage.setItem(exerciseNotesCacheKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

export function forgetCachedExerciseNotes(storage: Storage, userId: string): void {
  try {
    storage.removeItem(exerciseNotesCacheKey(userId));
  } catch {
    return;
  }
}

export async function loadExerciseNotesCacheFirst(
  storage: Storage,
  userId: string,
  fetchLive: () => Promise<ExerciseNotes>,
  show: (notes: ExerciseNotes) => void,
): Promise<void> {
  const cached = readCachedExerciseNotes(storage, userId);
  if (cached) show(cached);
  try {
    const live = await fetchLive();
    saveCachedExerciseNotes(storage, userId, live);
    show(live);
  } catch {
    return;
  }
}
