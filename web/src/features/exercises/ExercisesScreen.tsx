import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import {
  OFFLINE_EXERCISES_NOTICE,
  OFFLINE_EXERCISES_WITHOUT_SKILLS_NOTICE,
} from '../../lib/exercises/catalog-cache.ts';
import { type Exercise, exerciseLabels } from '../../lib/exercises/catalog-rules.ts';
import { setCustomExerciseArchived } from '../../lib/exercises/custom-exercises.ts';
import { CustomExerciseForm } from './CustomExerciseForm.tsx';
import { messageOf } from '../../lib/error-text.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { exerciseListLoadQuery, skillsQuery } from '../../lib/query/queries.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { standingCache } from '../../offline/standing-cache.ts';

type Editing = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; exercise: Exercise };

interface ExercisesScreenProps {
  userId: string;
}

export function ExercisesScreen({ userId }: ExercisesScreenProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const exerciseList = useQuery(exerciseListLoadQuery(userId));
  const liveSkills = useQuery(skillsQuery);
  const [savedSkills] = useState(() => standingCache.read(deviceStorage(), userId)?.skills ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(() =>
    searchParams.get('new') === '1' ? { kind: 'new' } : { kind: 'none' },
  );
  const [actionProblem, setActionProblem] = useState<string | null>(null);

  const load = exerciseList.data;
  const skills = liveSkills.data ?? savedSkills;
  const skillsSettled = skills !== null || liveSkills.isError;
  const exercises = load && skillsSettled ? load.loaded.filter((exercise) => exercise.custom) : null;
  const savedNotice = load
    ? cacheFirstNotice(load, skills ? OFFLINE_EXERCISES_NOTICE : OFFLINE_EXERCISES_WITHOUT_SKILLS_NOTICE)
    : null;
  const problem = actionProblem ?? (load ? null : (exerciseList.error?.message ?? null));

  const closeForm = () => {
    setEditing({ kind: 'none' });
    if (searchParams.has('new')) setSearchParams({}, { replace: true });
  };

  const setArchived = async (exercise: Exercise, archived: boolean) => {
    try {
      await setCustomExerciseArchived(exercise.id, archived);
      setActionProblem(null);
      void announceDataChange(queryClient, 'exercise-saved');
    } catch (error) {
      setActionProblem(messageOf(error, 'Could not update the exercise.'));
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
      <Link className="back-link" to="/profile">
        ‹ Profile
      </Link>
      <h1 className="title">Exercises</h1>
      {savedNotice && (
        <p className="notice" role="status">
          {savedNotice}
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
          skills={skills ?? []}
          onSaved={() => {
            void announceDataChange(queryClient, 'exercise-saved');
            closeForm();
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
