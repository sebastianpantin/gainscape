import { useEffect, useState } from 'react';
import { countUpValue } from '../lib/ui/count-up-rules.ts';

interface CountUpProps {
  value: number;
  from?: number;
  durationMs: number;
  animate: boolean;
  format: (value: number) => string;
}

export function CountUp({ value, from = 0, durationMs, animate, format }: CountUpProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      setElapsedMs(elapsed);
      if (elapsed < durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, durationMs]);

  if (!animate || elapsedMs >= durationMs) return format(value);
  return (
    <>
      <span aria-hidden="true">{format(countUpValue(value, elapsedMs, durationMs, from))}</span>
      <span className="visually-hidden">{format(value)}</span>
    </>
  );
}
