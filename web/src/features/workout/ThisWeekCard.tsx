import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { weeklyGoalQuery } from '../../lib/query/queries.ts';
import { thisWeekView, WEEKDAY_LETTERS, type WeekStripDay, weekStripLabel } from './week-strip-rules.ts';

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

function LoadingWeekStrip() {
  return (
    <div className="week-strip" aria-hidden="true">
      {WEEKDAY_LETTERS.map((letter, index) => (
        <span key={index} className="week-day">
          {letter}
        </span>
      ))}
    </div>
  );
}

interface ThisWeekCardProps {
  today: string | null;
  trainedDates: readonly string[] | undefined;
}

export function ThisWeekCard({ today, trainedDates }: ThisWeekCardProps) {
  const headingId = useId();
  const view = thisWeekView(useQuery(weeklyGoalQuery).data, today, trainedDates);
  return (
    <section className="panel stack" aria-labelledby={headingId} aria-busy={view.summary === null}>
      <div className="row spread wrap">
        <h2 id={headingId}>This week</h2>
        {view.streak && <span className="streak-badge">{view.streak}</span>}
      </div>
      {view.days ? <WeekStrip days={view.days} /> : <LoadingWeekStrip />}
      <div className="row spread wrap">
        <span>{view.summary ?? 'Loading this week'}</span>
        {view.offerGoal && (
          <Link className="tap-link" to="/profile/settings">
            Set a weekly goal
          </Link>
        )}
      </div>
      {view.risk && <p className="accent-text">{view.risk}</p>}
    </section>
  );
}
