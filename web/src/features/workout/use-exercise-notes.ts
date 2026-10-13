import { useEffect, useRef, useState } from 'react';
import { loadExerciseNotesCacheFirst, saveCachedExerciseNotes } from '../../lib/exercises/exercise-note-cache.ts';
import { type ExerciseNotes, type LocalNoteSaves, withNote } from '../../lib/exercises/exercise-note-rules.ts';
import { fetchExerciseNotes, saveExerciseNote } from '../../lib/exercises/exercise-notes.ts';

export function useExerciseNotes(userId: string) {
  const [notes, setNotes] = useState<ExerciseNotes>({});
  const notesSavedHere = useRef<LocalNoteSaves>({});

  useEffect(() => {
    let active = true;
    void loadExerciseNotesCacheFirst(
      localStorage,
      userId,
      fetchExerciseNotes,
      (loaded) => active && setNotes(loaded),
      () => notesSavedHere.current,
    );
    return () => {
      active = false;
    };
  }, [userId]);

  const saveNote = async (exerciseId: string, body: string) => {
    const saved = await saveExerciseNote(exerciseId, body);
    notesSavedHere.current = { ...notesSavedHere.current, [exerciseId]: saved };
    setNotes((current) => {
      const next = withNote(current, exerciseId, saved);
      saveCachedExerciseNotes(localStorage, userId, next);
      return next;
    });
  };

  return { notes, saveNote };
}
