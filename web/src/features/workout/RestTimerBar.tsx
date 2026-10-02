import { useEffect, useState } from 'react';
import { REST_STEP_S, restClock, restView } from '../../lib/rest-timer-rules.ts';
import type { RestTimerControls } from './use-rest-timer.ts';

const TICK_MS = 250;

export function RestTimerBar({ timer, adjust, stop }: RestTimerControls) {
  const [now, setNow] = useState(() => Date.now());
  const view = restView(timer, now);

  useEffect(() => {
    if (timer === null) return;
    const ticker = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(ticker);
  }, [timer]);

  if (view.kind === 'idle') return null;
  if (view.kind === 'over') {
    return (
      <section className="rest-timer over" aria-label="Rest timer">
        <p className="rest-clock" role="status">
          Rest over
        </p>
        <button className="button" type="button" onClick={stop}>
          Dismiss
        </button>
      </section>
    );
  }
  return (
    <section className="rest-timer" aria-label="Rest timer">
      <span className="muted tiny">Rest</span>
      <span className="rest-clock" role="timer" aria-label="Rest remaining">
        {restClock(view.remainingS)}
      </span>
      <button
        className="button icon"
        type="button"
        aria-label={`Remove ${REST_STEP_S} seconds`}
        onClick={() => adjust(-REST_STEP_S)}
      >
        −{REST_STEP_S}
      </button>
      <button
        className="button icon"
        type="button"
        aria-label={`Add ${REST_STEP_S} seconds`}
        onClick={() => adjust(REST_STEP_S)}
      >
        +{REST_STEP_S}
      </button>
      <button className="button" type="button" onClick={stop}>
        Skip rest
      </button>
    </section>
  );
}
