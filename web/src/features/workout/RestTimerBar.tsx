import { type ReactNode, type RefObject, useEffect, useState } from 'react';
import { REST_STEP_S, restClock, restLeftFraction, restView } from '../../lib/workout/rest-timer-rules.ts';
import type { RestTimerControls } from './use-rest-timer.ts';

const TICK_MS = 250;

interface RestTimerBarProps extends RestTimerControls {
  focusAfterStop: RefObject<HTMLButtonElement | null>;
  focusFallback: RefObject<HTMLElement | null>;
  prompt?: (moveFocusOn: () => void) => ReactNode;
}

export function RestTimerBar({
  timer,
  changedAt,
  adjust,
  stop,
  focusAfterStop,
  focusFallback,
  prompt,
}: RestTimerBarProps) {
  const [tickedAt, setTickedAt] = useState(() => Date.now());
  const now = Math.max(tickedAt, changedAt);
  const view = restView(timer, now);
  const showing = view.kind !== 'idle';

  useEffect(() => {
    if (!showing) return;
    const ticker = setInterval(() => setTickedAt(Date.now()), TICK_MS);
    return () => clearInterval(ticker);
  }, [showing]);

  if (view.kind === 'idle') return null;
  const resting = view.kind === 'resting';
  const moveFocusOn = () => {
    const next = focusAfterStop.current;
    if (next && !next.disabled) next.focus();
    else focusFallback.current?.focus();
  };
  const stopAndFocus = () => {
    stop();
    moveFocusOn();
  };
  const leftFraction = resting ? restLeftFraction(timer, now) : 1;
  return (
    <>
      {prompt?.(moveFocusOn)}
      <section className={resting ? 'rest-timer' : 'rest-timer over'} aria-label="Rest timer">
        {resting ? (
          <span className="rest-reading" key="resting">
            <span className="rest-label">Rest</span>
            <span className="rest-clock" role="timer" aria-label="Rest remaining">
              {restClock(view.remainingS)}
            </span>
          </span>
        ) : (
          <span className="rest-reading" key="over">
            <span className="rest-label" role="status">
              Rest over
            </span>
            <span className="rest-clock" role="timer" aria-label="Rest over by">
              +{restClock(view.overS)}
            </span>
          </span>
        )}
        {leftFraction !== null && (
          <span className="rest-progress" aria-hidden="true">
            <span style={{ width: `${leftFraction * 100}%` }} />
          </span>
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
    </>
  );
}
