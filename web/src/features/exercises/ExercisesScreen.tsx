import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchExercises, fetchSkills } from '../../lib/catalog.ts';
import { OFFLINE_EXERCISES_NOTICE, readCachedExercises } from '../../lib/catalog-cache.ts';
import { type Exercise, exerciseLabels, type Skill } from '../../lib/catalog-rules.ts';
import { setCustomExerciseArchived } from '../../lib/custom-exercises.ts';
import { CustomExerciseForm } from './CustomExerciseForm.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { standingCache } from '../../offline/standing-cache.ts';

type Editing = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; exercise: Exercise };

function savedExercisesAndSkills(userId: string): { exercises: Exercise[]; skills: Skill[] } | null {
  const storage = deviceStorage();
  const exercises = storage && readCachedExercises(storage, userId);
  return exercises ? { exercises, skills: standingCache.read(storage, userId)?.skills ?? [] } : null;
}

interface ExercisesScreenProps {
  userId: string;
}

export function ExercisesScreen({ userId }: ExercisesScreenProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(() =>
    searchParams.get('new') === '1' ? { kind: 'new' } : { kind: 'none' },
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const reload = useCallback(() => {
    loadCacheFirstWhenOffline(
      isDeviceOffline,
      () => savedExercisesAndSkills(userId),
      async () => {
        const [loadedExercises, loadedSkills] = await Promise.all([
          fetchExercises({ includeArchived: true }),
          fetchSkills(),
        ]);
        return { exercises: loadedExercises, skills: loadedSkills };
      },
    ).then(
      ({ loaded, fromCache: loadedFromCache }) => {
        setExercises(loaded.exercises.filter((exercise) => exercise.custom));
        setSkills(loaded.skills);
        setFromCache(loadedFromCache);
      },
      (error: Error) => setProblem(error.message),
    );
  }, [userId]);

  useEffect(reload, [reload]);

  const closeForm = () => {
    setEditing({ kind: 'none' });
    if (searchParams.has('new')) setSearchParams({}, { replace: true });
  };

  const setArchived = async (exercise: Exercise, archived: boolean) => {
    try {
      await setCustomExerciseArchived(exercise.id, archived);
      reload();
    } catch (error) {
      setProblem(messageOf(error, 'Could not update the exercise.'));
    }
  };

  if (!exercises)
    return (
      <main className="screen">
        {problem ? (
          <p className="problem" role="alert">
            {problem}
          </p>
        ) : (
          <p>Loading…</p>
        )}
      </main>
    );

  const shown = exercises.filter((exercise) => showArchived || !exercise.archived);

  return (
    <main className="screen stack">
      <h1 className="title">Exercises</h1>
      {fromCache && (
        <p className="notice" role="status">
          {OFFLINE_EXERCISES_NOTICE}
        </p>
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {editing.kind === 'none' ? (
        <button className="button primary" type="button" onClick={() => setEditing({ kind: 'new' })}>
          New custom exercise
        </button>
      ) : (
        <CustomExerciseForm
          key={editing.kind === 'edit' ? editing.exercise.id : 'new'}
          exercise={editing.kind === 'edit' ? editing.exercise : null}
          skills={skills}
          onSaved={() => {
            closeForm();
            reload();
          }}
          onCancel={closeForm}
        />
      )}
      <label className="row">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        Show archived
      </label>
      {shown.length === 0 && <p className="panel muted">You have no custom exercises yet.</p>}
      <ul className="stack exercise-list">
        {shown.map((exercise) => (
          <li className="panel row spread" key={exercise.id}>
            <span>
              {exercise.name} <span className="muted">{exerciseLabels(exercise)}</span>
            </span>
            <span className="row">
              <button className="button link" type="button" onClick={() => setEditing({ kind: 'edit', exercise })}>
                Edit
              </button>
              <button className="button link" type="button" onClick={() => setArchived(exercise, !exercise.archived)}>
                {exercise.archived ? 'Unarchive' : 'Archive'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
