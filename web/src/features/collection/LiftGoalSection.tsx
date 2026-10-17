import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { type LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { messageOf } from '../../lib/error-text.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { type RepMaxEntry } from '../../lib/progress/exercise-progress-rules.ts';
import {
  achievedText,
  deadlineText,
  liftGoalDraft,
  liftGoalInput,
  liftGoalProgressText,
  liftGoalTargetText,
  todayLocalDate,
} from '../../lib/progress/lift-goal-rules.ts';
import { removeLiftGoal, saveLiftGoal } from '../../lib/progress/lift-goals.ts';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { liftGoalsQuery } from '../../lib/query/queries.ts';
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
  const goals = useQuery(liftGoalsQuery(userId));
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const status = goals.data?.find(({ goal }) => goal.exerciseId === exercise.id) ?? null;

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

  const deadline = status && deadlineText(status.goal.targetDate, todayLocalDate(new Date()));

  return (
    <section className="panel stack" aria-labelledby="goal-heading">
      <h2 id="goal-heading">Goal</h2>
      {goals.data === undefined ? (
        <p className="muted">{goals.error ? messageOf(goals.error, 'Could not load your goal.') : 'Loading…'}</p>
      ) : editing ? (
        <LiftGoalForm
          initial={liftGoalDraft(status?.goal ?? null, repMaxes, unitPref)}
          unit={unitPref}
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
          {status.achievedAt ? (
            <p className="accent-text">{achievedText(status.achievedAt)}</p>
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
