import { useEffect, useState } from 'react';
import { adjustRest, REST_OFF, type RestState, type RestTimer, startRest } from '../../lib/rest-timer-rules.ts';
import { deviceStorage, readRestState, restStateKey, saveRestState } from '../../lib/rest-timer-store.ts';

export interface RestTimerControls {
  timer: RestTimer | null;
  start: () => void;
  adjust: (deltaS: number) => void;
  stop: () => void;
}

export function useRestTimer(userId: string): RestTimerControls {
  const [state, setState] = useState<RestState>(() => readRestState(deviceStorage(), userId));

  useEffect(() => {
    const followOtherTabs = (event: StorageEvent) => {
      if (event.key === restStateKey(userId)) setState(readRestState(deviceStorage(), userId));
    };
    window.addEventListener('storage', followOtherTabs);
    return () => window.removeEventListener('storage', followOtherTabs);
  }, [userId]);

  const changeTimer = (timer: RestTimer | null) => {
    const next = { ...readRestState(deviceStorage(), userId), timer };
    setState(next);
    saveRestState(deviceStorage(), userId, next);
  };

  return {
    timer: state.timer,
    start: () => {
      const { restS } = readRestState(deviceStorage(), userId);
      if (restS !== REST_OFF) changeTimer(startRest(Date.now(), restS));
    },
    adjust: (deltaS) => {
      if (state.timer) changeTimer(adjustRest(state.timer, deltaS, Date.now()));
    },
    stop: () => {
      if (state.timer) changeTimer(null);
    },
  };
}
