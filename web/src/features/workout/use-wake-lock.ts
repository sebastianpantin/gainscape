import { useEffect, useState } from 'react';
import { holdsWakeLock } from '../../lib/training-device-rules.ts';

function pageVisible(): boolean {
  return document.visibilityState === 'visible';
}

export function useWakeLock(keepAwake: boolean, workoutOpen: boolean): void {
  const [visible, setVisible] = useState(pageVisible);

  useEffect(() => {
    const followVisibility = () => setVisible(pageVisible());
    document.addEventListener('visibilitychange', followVisibility);
    return () => document.removeEventListener('visibilitychange', followVisibility);
  }, []);

  const holding = holdsWakeLock({ keepAwake, workoutOpen, visible });

  useEffect(() => {
    if (!holding || !('wakeLock' in navigator)) return;
    let released = false;
    let sentinel: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then(
      (acquired) => {
        if (released) void acquired.release();
        else sentinel = acquired;
      },
      () => undefined,
    );
    return () => {
      released = true;
      void sentinel?.release().catch(() => undefined);
    };
  }, [holding]);
}
