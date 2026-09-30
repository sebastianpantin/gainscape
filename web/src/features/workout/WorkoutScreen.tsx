import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Exercise, fetchBuiltInExercises, saveBodyweight } from '../../lib/catalog.ts';
import type { SessionSummary } from '@domain/types.ts';
import {
  addExercise,
  addSet,
  discardDraft,
  loadDraft,
  loggedSetCount,
  removeExercise,
  removeSet,
  saveDraft,
  startDraft,
  updateSet,
  type WorkoutDraft,
} from '../../offline/workout-draft.ts';
import { rememberLastSummary } from '../summary/last-summary.ts';
import { BodyweightPrompt } from './BodyweightPrompt.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { SetRow } from './SetRow.tsx';
import { useFinishSync } from './use-finish-sync.ts';

interface WorkoutScreenProps {
  userId: string;
}

export function WorkoutScreen({ userId }: WorkoutScreenProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<WorkoutDraft | null>(() => loadDraft(userId));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);

  useEffect(() => {
    fetchBuiltInExercises().then(setExercises, (error: Error) => setLoadProblem(error.message));
  }, []);

  const changeDraft = (next: WorkoutDraft | null) => {
    setDraft(next);
    if (next) saveDraft(userId, next);
    else discardDraft(userId);
  };

  const finishStatus = useFinishSync(draft, (summary: SessionSummary) => {
    changeDraft(null);
    rememberLastSummary(summary);
    navigate('/reveal', { state: summary });
  });

  if (!draft) {
    return (
      <main className="screen stack">
        <h1 className="title">Workout</h1>
        <button className="button primary big" type="button" onClick={() => changeDraft(startDraft())}>
          Start workout
        </button>
      </main>
    );
  }

  if (draft.finishedAt) {
    return (
      <main className="screen stack">
        <h1 className="title">Saving workout…</h1>
        {finishStatus.kind === 'syncing' && (
          <p className="panel">
            {finishStatus.lastProblem
              ? `Couldn't reach the server (${finishStatus.lastProblem}). Retrying — your workout is saved on this device.`
              : 'Sending your workout…'}
          </p>
        )}
        {finishStatus.kind === 'rejected' && finishStatus.reason === 'bodyweight_required' && (
          <BodyweightPrompt
            onSave={async (bodyweightKg) => {
              await saveBodyweight(userId, bodyweightKg);
              changeDraft({ ...draft });
            }}
          />
        )}
        {finishStatus.kind === 'rejected' && finishStatus.reason !== 'bodyweight_required' && (
          <div className="panel stack">
            <p className="problem" role="alert">
              The server rejected this workout: {finishStatus.reason}
            </p>
            <button className="button" type="button" onClick={() => changeDraft({ ...draft, finishedAt: null })}>
              Back to editing
            </button>
            <button className="button danger" type="button" onClick={() => changeDraft(null)}>
              Discard workout
            </button>
          </div>
        )}
      </main>
    );
  }

  const canFinish = loggedSetCount(draft) > 0;

  return (
    <main className="screen stack">
      <h1 className="title">Workout</h1>
      {loadProblem && (
        <p className="problem" role="alert">
          {loadProblem}
        </p>
      )}
      {draft.exercises.map((exercise, exerciseIndex) => (
        <section className="panel stack" key={`${exercise.exerciseId}-${exerciseIndex}`}>
          <header className="row spread">
            <h2>{exercise.name}</h2>
            <button
              className="button link"
              type="button"
              onClick={() => changeDraft(removeExercise(draft, exerciseIndex))}
            >
              Remove
            </button>
          </header>
          <ol className="set-list">
            {exercise.sets.map((set, setIndex) => (
              <SetRow
                key={set.id}
                setNumber={setIndex + 1}
                loadType={exercise.loadType}
                set={set}
                onChange={(changes) => changeDraft(updateSet(draft, exerciseIndex, set.id, changes))}
                onRemove={() => changeDraft(removeSet(draft, exerciseIndex, set.id))}
              />
            ))}
          </ol>
          <button className="button" type="button" onClick={() => changeDraft(addSet(draft, exerciseIndex))}>
            + Add set
          </button>
        </section>
      ))}
      <ExercisePicker
        exercises={exercises}
        onPick={(exercise) =>
          changeDraft(addSet(addExercise(draft, exercise.id, exercise.name, exercise.loadType), draft.exercises.length))
        }
      />
      <button
        className="button primary big"
        type="button"
        disabled={!canFinish}
        onClick={() => changeDraft({ ...draft, finishedAt: new Date().toISOString() })}
      >
        Finish workout
      </button>
    </main>
  );
}
