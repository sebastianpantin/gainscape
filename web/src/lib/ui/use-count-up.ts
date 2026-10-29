import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../platform/device-effects.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { COUNT_UP_MS, type CountUpRun, countUpStart, shownCountUp } from './count-up-rules.ts';
import { readLastSeenNumber, saveLastSeenNumber } from './last-seen-number-store.ts';

interface SeenRun extends CountUpRun {
  userId: string;
  metric: string;
}

interface CountUpFrame {
  run: SeenRun;
  elapsedMs: number;
}

interface SeenCount {
  shown: number;
  rose: boolean;
}

function runFromLastSeen(userId: string, metric: string, value: number): SeenRun {
  const lastSeen = readLastSeenNumber(deviceStorage(), userId, metric);
  return { userId, metric, from: countUpStart(lastSeen, value, prefersReducedMotion()), to: value };
}

export function useCountUp(userId: string, metric: string, value: number): SeenCount {
  const [frame, setFrame] = useState<CountUpFrame>(() => ({
    run: runFromLastSeen(userId, metric, value),
    elapsedMs: 0,
  }));
  let { run, elapsedMs } = frame;
  if (run.userId !== userId || run.metric !== metric || run.to !== value) {
    const sameNumber = run.userId === userId && run.metric === metric;
    run = sameNumber
      ? { ...run, from: countUpStart(shownCountUp(run, elapsedMs), value, prefersReducedMotion()), to: value }
      : runFromLastSeen(userId, metric, value);
    elapsedMs = 0;
    setFrame({ run, elapsedMs });
  }

  useEffect(() => {
    const remember = () => saveLastSeenNumber(deviceStorage(), run.userId, run.metric, run.to);
    if (run.from >= run.to) {
      remember();
      return;
    }
    let startedAt: number | undefined;
    let request = 0;
    const tick = (now: number) => {
      startedAt ??= now;
      const elapsed = now - startedAt;
      setFrame((current) => (current.run === run ? { run, elapsedMs: elapsed } : current));
      if (elapsed < COUNT_UP_MS) request = requestAnimationFrame(tick);
      else remember();
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [run]);

  return { shown: shownCountUp(run, elapsedMs), rose: run.from < run.to };
}
