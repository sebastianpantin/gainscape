import { useEffect, useId, useState } from 'react';
import { fetchWeeklyGoalStatus } from '../../lib/weekly-goal.ts';
import { streakRiskText } from './today-rules.ts';
import { streakText, type WeeklyGoalStatus, weekProgressText } from '../../lib/weekly-goal-rules.ts';

export function WeeklyGoalCard() {
  const headingId = useId();
  const [status, setStatus] = useState<WeeklyGoalStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchWeeklyGoalStatus(controller.signal).then(setStatus, () => setStatus(null));
    return () => controller.abort();
  }, []);

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
