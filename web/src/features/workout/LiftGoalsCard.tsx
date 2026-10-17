import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { exerciseProgressPath } from '../../lib/progress/exercise-progress-rules.ts';
import {
  deadlineText,
  GOAL_REACHED_TEXT,
  goalsForToday,
  liftGoalTargetText,
} from '../../lib/progress/lift-goal-rules.ts';
import { useLiftGoals } from '../../lib/progress/use-lift-goals.ts';

export function LiftGoalsCard({ userId, unit }: { userId: string; unit: UnitPref }) {
  const headingId = useId();
  const { statuses, today } = useLiftGoals(userId);
  const shown = goalsForToday(statuses ?? []);

  if (shown.length === 0) return null;
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Lift goals</h2>
      <ul className="lift-goal-list">
        {shown.map(({ goal, achieved, fraction }) => (
          <li key={goal.exerciseId} className="stack">
            <div className="row spread wrap">
              <Link className="tap-link" to={exerciseProgressPath(goal.exerciseId)}>
                {goal.exerciseName}
              </Link>
              <span className={achieved ? 'accent-text' : 'muted'}>
                {achieved ? GOAL_REACHED_TEXT : deadlineText(goal.targetDate, today)}
              </span>
            </div>
            <span>{liftGoalTargetText(goal, unit)}</span>
            <ProgressBar fraction={fraction} label={`${goal.exerciseName} goal progress`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
