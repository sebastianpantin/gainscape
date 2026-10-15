import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { weeklyGoalQuery } from '../../lib/query/queries.ts';
import { streakRiskText } from './today-rules.ts';
import { streakText, weekProgressText } from '../../lib/progress/weekly-goal-rules.ts';

export function WeeklyGoalCard() {
  const headingId = useId();
  const status = useQuery(weeklyGoalQuery).data;

  if (status?.goal == null) return null;
  const risk = streakRiskText(status, new Date());
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Weekly goal</h2>
      <p>{weekProgressText(status)}</p>
      <p className="muted">{streakText(status.streakWeeks)}</p>
      {risk && <p className="accent-text">{risk}</p>}
    </section>
  );
}
