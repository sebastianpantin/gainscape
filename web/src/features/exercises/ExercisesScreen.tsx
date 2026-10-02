import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchExercises, fetchSkills } from '../../lib/catalog.ts';
import { type Exercise, exerciseLabels, type Skill } from '../../lib/catalog-rules.ts';
import { setCustomExerciseArchived } from '../../lib/custom-exercises.ts';
import { CustomExerciseForm } from './CustomExerciseForm.tsx';
import { messageOf } from '../../lib/error-text.ts';

type Editing = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; exercise: Exercise };

export function ExercisesScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(() =>
    searchParams.get('new') === '1' ? { kind: 'new' } : { kind: 'none' },
  );
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([fetchExercises({ includeArchived: true }), fetchSkills()]).then(
      ([loadedExercises, loadedSkills]) => {
        setExercises(loadedExercises.filter((exercise) => exercise.custom));
        setSkills(loadedSkills);
      },
      (error: Error) => setProblem(error.message),
    );
  }, []);

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
