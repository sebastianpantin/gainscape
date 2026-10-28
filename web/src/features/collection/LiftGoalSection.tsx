import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { type LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { messageOf } from '../../lib/error-text.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { type RepMaxEntry } from '../../lib/progress/exercise-progress-rules.ts';
import {
  deadlineText,
  GOAL_REACHED_TEXT,
  liftGoalDraft,
  liftGoalHint,
  liftGoalInput,
  liftGoalProgressText,
  liftGoalTargetText,
} from '../../lib/progress/lift-goal-rules.ts';
import { removeLiftGoal, saveLiftGoal } from '../../lib/progress/lift-goals.ts';
import { useLiftGoals } from '../../lib/progress/use-lift-goals.ts';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { useToast } from '../../lib/ui/toast.ts';
import { LiftGoalForm } from './LiftGoalForm.tsx';

interface LiftGoalSectionProps {
  userId: string;
  exercise: LiftExercise;
  repMaxes: RepMaxEntry[];
}

export function LiftGoalSection({ userId, exercise, repMaxes }: LiftGoalSectionProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { unitPref } = usePreferences();
  const { statuses, error, retry, today } = useLiftGoals(userId);
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const status = statuses?.find(({ goal }) => goal.exerciseId === exercise.id) ?? null;

  const write = async (change: () => Promise<void>, doneText: string, failureText: string) => {
    setBusy(true);
    setProblem(null);
    try {
      await change();
      await announceDataChange(queryClient, 'lift-goals-saved');
      setEditing(false);
      showToast(doneText);
    } catch (error) {
      setProblem(messageOf(error, failureText));
    } finally {
      setConfirmingRemove(false);
      setBusy(false);
    }
  };

  const deadline = status && deadlineText(status.goal.targetDate, today);
  const hint = status && liftGoalHint(status, unitPref);

  return (
    <section className="panel stack" aria-labelledby="goal-heading">
      <h2 id="goal-heading">Goal</h2>
      {statuses === undefined ? (
        error ? (
          <ProblemWithRetry problem={messageOf(error, 'Could not load your goal.')} onRetry={retry} />
        ) : (
          <ListSkeleton panels={1} />
        )
      ) : editing ? (
        <LiftGoalForm
          initial={liftGoalDraft(status?.goal ?? null, repMaxes, unitPref)}
          loadType={exercise.loadType}
          unit={unitPref}
          today={today}
          busy={busy}
          onSave={(draft) =>
            void write(
              () => saveLiftGoal(liftGoalInput(exercise.id, draft, unitPref)),
              'Goal saved',
              'Could not save your goal.',
            )
          }
          onCancel={() => setEditing(false)}
        />
      ) : status ? (
        <>
          <p>{liftGoalTargetText(status.goal, unitPref)}</p>
          <ProgressBar fraction={status.fraction} label={`${exercise.name} goal progress`} />
          <p className="muted">{liftGoalProgressText(status, unitPref)}</p>
          {hint && <p>{hint}</p>}
          {status.achieved ? (
            <p className="accent-text">{GOAL_REACHED_TEXT}</p>
          ) : (
            deadline && <p className="muted">{deadline}</p>
          )}
          <div className="row wrap">
            <button className="button outline" type="button" onClick={() => setEditing(true)}>
              Edit goal
            </button>
            <button className="button outline" type="button" onClick={() => setConfirmingRemove(true)}>
              Remove goal
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Pick a weight and reps to work toward on this lift.</p>
          <button className="button outline" type="button" onClick={() => setEditing(true)}>
            Set a goal
          </button>
        </>
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {confirmingRemove && status && (
        <ConfirmDialog
          title="Remove this goal?"
          confirmLabel="Remove"
          danger
          busy={busy}
          onConfirm={() => void write(() => removeLiftGoal(exercise.id), 'Goal removed', 'Could not remove your goal.')}
          onCancel={() => setConfirmingRemove(false)}
        >
          <p>{liftGoalTargetText(status.goal, unitPref)}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
