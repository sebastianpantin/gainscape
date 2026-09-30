import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type Exercise, fetchExercises, type LoadType, saveBodyweight } from '../../lib/catalog.ts';
import type { SessionSummary } from '@domain/types.ts';
import {
  addExercise,
  addSet,
  doneSetCount,
  removeExercise,
  removeSet,
  startDraft,
  updateSet,
  withCurrentLoadTypes,
  type WorkoutDraft,
} from '../../offline/draft-format.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import { recallLastSummary } from '../summary/last-summary.ts';
import { BodyweightPrompt } from './BodyweightPrompt.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { OtherAccountDraftNotice } from './OtherAccountDraftNotice.tsx';
import { SetRow } from './SetRow.tsx';
import { useFinishSync } from './use-finish-sync.ts';

const EXERCISE_CHANGED_REASONS = new Set(['bodyweight_load_not_zero', 'unknown_exercise']);

interface WorkoutScreenProps {
  userId: string;
}

const LOAD_TYPE_CHECK_TIMEOUT_MS = 5000;

async function currentLoadTypes(draft: WorkoutDraft, exercises: Exercise[]): Promise<Map<string, LoadType>> {
  const builtInIds = new Set(exercises.filter((exercise) => !exercise.custom).map((exercise) => exercise.id));
  const hasCustom = draft.exercises.some((exercise) => !builtInIds.has(exercise.exerciseId));
  if (!hasCustom || navigator.onLine === false) return new Map();
  try {
    const catalog = await fetchExercises({
      includeArchived: true,
      signal: AbortSignal.timeout(LOAD_TYPE_CHECK_TIMEOUT_MS),
    });
    const customIds = new Set(
      draft.exercises.map((exercise) => exercise.exerciseId).filter((id) => !builtInIds.has(id)),
    );
    return new Map(
      catalog.filter((exercise) => customIds.has(exercise.id)).map((exercise) => [exercise.id, exercise.loadType]),
    );
  } catch {
    return new Map();
  }
}

export function WorkoutScreen({ userId }: WorkoutScreenProps) {
  const navigate = useNavigate();
  const { state, store, saveProblem, changeDraft, updateDraft, startWorkout, discardDraft, markSynced, reload, flush } =
    useWorkoutDraft(userId);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [finishProblem, setFinishProblem] = useState<string | null>(null);
  const [checkingFinish, setCheckingFinish] = useState(false);
  const draft = state.status === 'ready' ? state.draft : null;

  useEffect(() => {
    fetchExercises({ includeArchived: false }).then(setExercises, (error: Error) => setLoadProblem(error.message));
  }, []);

  const { status: finishStatus, retryNow } = useFinishSync({
    userId,
    draft,
    store,
    flush,
    markSynced,
    onSynced: (summary: SessionSummary) => navigate('/reveal', { state: summary }),
    onSuperseded: (sessionId: string) => {
      if (recallLastSummary()?.sessionId === sessionId) navigate('/reveal');
      else void reload();
    },
  });

  if (state.status === 'loading') {
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );
  }

  const deviceNotices = (
    <>
      {saveProblem && (
        <p className="problem" role="alert">
          Couldn't save on this device
        </p>
      )}
      {store && <OtherAccountDraftNotice store={store} userId={userId} />}
    </>
  );

  if (!draft) {
    return (
      <main className="screen stack">
        <h1 className="title">Workout</h1>
        {deviceNotices}
        {state.notice === 'saved_elsewhere' && (
          <p className="panel" role="status">
            This workout was saved in another tab.
          </p>
        )}
        <button className="button primary big" type="button" onClick={() => startWorkout(startDraft)}>
          Start workout
        </button>
      </main>
    );
  }

  const backToEditing = () => changeDraft({ ...draft, finishedAt: null }, { reopen: true });

  if (draft.finishedAt) {
    return (
      <main className="screen stack">
        <h1 className="title">Saving workout…</h1>
        {deviceNotices}
        {finishStatus.kind === 'syncing' && (
          <div className="panel stack">
            <p>
              {finishStatus.lastProblem
                ? `Couldn't reach the server (${finishStatus.lastProblem}). Retrying — your workout is saved on this device.`
                : 'Sending your workout…'}
            </p>
            {finishStatus.lastProblem && (
              <button className="button" type="button" onClick={retryNow}>
                Retry now
              </button>
            )}
          </div>
        )}
        {finishStatus.kind === 'rejected' && finishStatus.reason === 'bodyweight_required' && (
          <BodyweightPrompt
            onSave={async (bodyweightKg) => {
              await saveBodyweight(userId, bodyweightKg);
              retryNow();
            }}
          />
        )}
        {finishStatus.kind === 'rejected' && finishStatus.reason !== 'bodyweight_required' && (
          <div className="panel stack">
            <p className="problem" role="alert">
              {EXERCISE_CHANGED_REASONS.has(finishStatus.reason)
                ? 'Load type of an exercise changed; check the weights'
                : `The server rejected this workout: ${finishStatus.reason}`}
            </p>
            <button className="button" type="button" onClick={backToEditing}>
              Back to editing
            </button>
            <button className="button danger" type="button" onClick={() => discardDraft(draft.sessionId)}>
              Discard workout
            </button>
          </div>
        )}
      </main>
    );
  }

  const finish = async () => {
    setCheckingFinish(true);
    setFinishProblem(null);
    const loadTypes = await currentLoadTypes(draft, exercises);
    setCheckingFinish(false);
    let changedNames: string[] = [];
    updateDraft((latest) => {
      if (latest.sessionId !== draft.sessionId || latest.finishedAt) return latest;
      const checked = withCurrentLoadTypes(latest, loadTypes);
      changedNames = checked.changedNames;
      return changedNames.length > 0 ? checked.draft : { ...checked.draft, finishedAt: new Date().toISOString() };
    });
    if (changedNames.length > 0) setFinishProblem(`Load type of ${changedNames.join(', ')} changed; check the weights`);
  };

  const canFinish = doneSetCount(draft) > 0 && !checkingFinish;

  return (
    <main className="screen stack">
      <h1 className="title">Workout</h1>
      {deviceNotices}
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
      <Link className="button link" to="/exercises?new=1">
        Create custom exercise
      </Link>
      {finishProblem && (
        <p className="problem" role="alert">
          {finishProblem}
        </p>
      )}
      <button className="button primary big" type="button" disabled={!canFinish} onClick={finish}>
        Finish workout
      </button>
    </main>
  );
}
