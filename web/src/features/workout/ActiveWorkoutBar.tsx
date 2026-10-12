import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { activeWorkoutBar, showsActiveWorkoutBarOn } from '../../lib/active-workout-bar-rules.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import { useRestTimer } from './use-rest-timer.ts';

const TICK_MS = 250;

export function ActiveWorkoutBar({ userId }: { userId: string }) {
  const { pathname } = useLocation();
  if (!showsActiveWorkoutBarOn(pathname)) return null;
  return <ActiveWorkoutLink userId={userId} pathname={pathname} />;
}

function ActiveWorkoutLink({ userId, pathname }: { userId: string; pathname: string }) {
  const { state } = useWorkoutDraft(userId);
  const rest = useRestTimer(userId);
  const [tickedAt, setTickedAt] = useState(() => Date.now());
  const draft = state.status === 'ready' ? state.draft : null;
  const bar = activeWorkoutBar({ pathname, draft, restTimer: rest.timer, now: Math.max(tickedAt, rest.changedAt) });
  const ticking = bar?.kind === 'in-progress';

  useEffect(() => {
    if (!ticking) return;
    const ticker = setInterval(() => setTickedAt(Date.now()), TICK_MS);
    return () => clearInterval(ticker);
  }, [ticking]);

  if (bar === null) return null;
  return (
    <Link to="/" className="active-workout-bar" aria-label={bar.name}>
      {bar.kind === 'in-progress' ? (
        <>
          <span>
            Workout in progress · <span className="active-workout-clock">{bar.elapsed}</span>
          </span>
          {bar.rest !== null && <span className="active-workout-rest">{bar.rest}</span>}
        </>
      ) : (
        <span>Workout not saved yet</span>
      )}
    </Link>
  );
}
