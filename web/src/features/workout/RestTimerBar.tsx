import { type RefObject, useEffect, useState } from 'react';
import { REST_STEP_S, restClock, restView } from '../../lib/rest-timer-rules.ts';
import type { RestTimerControls } from './use-rest-timer.ts';

const TICK_MS = 250;

interface RestTimerBarProps extends RestTimerControls {
  focusAfterStop: RefObject<HTMLButtonElement | null>;
  focusFallback: RefObject<HTMLElement | null>;
}

export function RestTimerBar({ timer, changedAt, adjust, stop, focusAfterStop, focusFallback }: RestTimerBarProps) {
  const [tickedAt, setTickedAt] = useState(() => Date.now());
  const view = restView(timer, Math.max(tickedAt, changedAt));
  const showing = view.kind !== 'idle';

  useEffect(() => {
    if (!showing) return;
    const ticker = setInterval(() => setTickedAt(Date.now()), TICK_MS);
    return () => clearInterval(ticker);
  }, [showing]);

  if (view.kind === 'idle') return null;
  const resting = view.kind === 'resting';
  const stopAndFocus = () => {
    const next = focusAfterStop.current;
    stop();
    if (next && !next.disabled) next.focus();
    else focusFallback.current?.focus();
  };
  return (
    <section className={resting ? 'rest-timer' : 'rest-timer over'} aria-label="Rest timer">
      {resting ? (
        <>
          <span className="muted tiny">Rest</span>
          <span className="rest-clock" role="timer" aria-label="Rest remaining">
            {restClock(view.remainingS)}
          </span>
        </>
      ) : (
        <p className="rest-clock" role="status">
          Rest over
        </p>
      )}
      <button
        className="button icon"
        type="button"
        aria-label={`Remove ${REST_STEP_S} seconds`}
        aria-disabled={!resting}
        onClick={() => {
          if (resting) adjust(-REST_STEP_S);
        }}
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
      <button className="button" type="button" onClick={stopAndFocus}>
        {resting ? 'Skip rest' : 'Dismiss'}
      </button>
    </section>
  );
}
