import { useEffect, useState } from 'react';
import { countUpValue } from '../lib/ui/count-up-rules.ts';
import { ShownNumber } from './ShownNumber.tsx';

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
  return <ShownNumber shown={countUpValue(value, elapsedMs, durationMs, from)} value={value} format={format} />;
}
