import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { exerciseProgressPath } from '../../lib/progress/exercise-progress-rules.ts';
import { achievedText, deadlineText, liftGoalTargetText, todayLocalDate } from '../../lib/progress/lift-goal-rules.ts';
import { liftGoalsQuery } from '../../lib/query/queries.ts';

export function LiftGoalsCard({ userId, unit }: { userId: string; unit: UnitPref }) {
  const headingId = useId();
  const statuses = useQuery(liftGoalsQuery(userId)).data;

  if (!statuses?.length) return null;
  const today = todayLocalDate(new Date());
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Lift goals</h2>
      <ul className="lift-goal-list">
        {statuses.map(({ goal, achievedAt, fraction }) => (
          <li key={goal.exerciseId} className="stack">
            <div className="row spread wrap">
              <Link className="tap-link" to={exerciseProgressPath(goal.exerciseId)}>
                {goal.exerciseName}
              </Link>
              <span className={achievedAt ? 'accent-text' : 'muted'}>
                {achievedAt ? achievedText(achievedAt) : deadlineText(goal.targetDate, today)}
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
