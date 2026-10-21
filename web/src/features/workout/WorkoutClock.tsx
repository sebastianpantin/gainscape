import { useEffect, useState } from 'react';
import { workoutClock } from '../../lib/workout/active-workout-bar-rules.ts';

const TICK_MS = 1000;

export function WorkoutClock({ startedAt, finishedAt }: { startedAt: string; finishedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const clock = workoutClock({ startedAt, finishedAt }, now);

  useEffect(() => {
    if (!clock.ticking) return;
    const tick = () => setNow(Date.now());
    const firstTick = setTimeout(tick, 0);
    const ticker = setInterval(tick, TICK_MS);
    return () => {
      clearTimeout(firstTick);
      clearInterval(ticker);
    };
  }, [clock.ticking]);

  return (
    <span role="timer" aria-label={clock.name}>
      {clock.text}
    </span>
  );
}
