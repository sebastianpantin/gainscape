import { z } from 'zod';
import { type ExerciseNotes, type LocalNoteSaves, withLocalSaves } from './exercise-note-rules.ts';
import { keyedStore } from './keyed-store.ts';

const CACHE_VERSION = 1;

const cachedNotesSchema = z.object({
  v: z.literal(CACHE_VERSION),
  savedAt: z.string(),
  userId: z.string(),
  notes: z.record(z.string(), z.string()),
});

export const {
  key: exerciseNotesCacheKey,
  read: readCachedExerciseNotes,
  save: saveCachedExerciseNotes,
  forget: forgetCachedExerciseNotes,
} = keyedStore<ExerciseNotes | null, ExerciseNotes>(
  'gainscape.exercise-notes.v1.',
  (raw, userId) => {
    if (!raw) return null;
    const parsed = cachedNotesSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.userId === userId ? parsed.data.notes : null;
  },
  (notes, userId) => ({ v: CACHE_VERSION, savedAt: new Date().toISOString(), userId, notes }),
);

export async function loadExerciseNotesCacheFirst(
  storage: Storage,
  userId: string,
  fetchLive: () => Promise<ExerciseNotes>,
  show: (notes: ExerciseNotes) => void,
  savedSinceLoad: () => LocalNoteSaves = () => ({}),
): Promise<void> {
  const cached = readCachedExerciseNotes(storage, userId);
  if (cached) show(cached);
  try {
    const live = withLocalSaves(await fetchLive(), savedSinceLoad());
    saveCachedExerciseNotes(storage, userId, live);
    show(live);
  } catch {
    return;
  }
}
