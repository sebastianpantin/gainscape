import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { streakText, weekProgressText, workoutWord } from '../../lib/progress/weekly-goal-rules.ts';
import { weeklyGoalQuery } from '../../lib/query/queries.ts';
import { streakRiskText } from './today-rules.ts';
import { type WeekStripDay, weekStripDays, weekStripLabel, workoutsThisWeek } from './week-strip-rules.ts';

function WeekStrip({ days }: { days: readonly WeekStripDay[] }) {
  return (
    <Link className="week-strip" to="/collection/stats" aria-label={weekStripLabel(days)}>
      {days.map((day) => (
        <span
          key={day.date}
          className={`week-day${day.trained ? ' trained' : ''}${day.isToday ? ' today' : ''}`}
          aria-hidden="true"
        >
          {day.letter}
        </span>
      ))}
    </Link>
  );
}

interface ThisWeekCardProps {
  today: string | null;
  trainedDates: readonly string[] | undefined;
}

export function ThisWeekCard({ today, trainedDates }: ThisWeekCardProps) {
  const headingId = useId();
  const status = useQuery(weeklyGoalQuery).data;
  const hasGoal = status?.goal != null;

  if ((today === null || !trainedDates) && !hasGoal) return null;
  const risk = hasGoal ? streakRiskText(status, new Date()) : null;
  const workouts = today !== null && trainedDates ? workoutsThisWeek(trainedDates, today) : 0;
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <div className="row spread wrap">
        <h2 id={headingId}>This week</h2>
        {hasGoal && <span className="streak-badge">{streakText(status.streakWeeks)}</span>}
      </div>
      {today !== null && trainedDates && <WeekStrip days={weekStripDays(trainedDates, today)} />}
      {hasGoal ? (
        <p>{weekProgressText(status)}</p>
      ) : (
        <div className="row spread wrap">
          <span>{`${workouts} ${workoutWord(workouts)} this week`}</span>
          <Link className="tap-link" to="/profile/settings">
            Set a weekly goal
          </Link>
        </div>
      )}
      {risk && <p className="accent-text">{risk}</p>}
    </section>
  );
}
