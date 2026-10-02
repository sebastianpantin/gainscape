import { useEffect, useState } from 'react';
import { adjustRest, REST_OFF, type RestState, type RestTimer, startRest } from '../../lib/rest-timer-rules.ts';
import { deviceStorage, readRestState, restStateKey, saveRestState } from '../../lib/rest-timer-store.ts';

export interface RestTimerControls {
  timer: RestTimer | null;
  changedAt: number;
  start: (setId: string) => void;
  adjust: (deltaS: number) => void;
  stop: () => void;
}

interface Tracked {
  state: RestState;
  changedAt: number;
}

function readNow(userId: string): Tracked {
  return { state: readRestState(deviceStorage(), userId), changedAt: Date.now() };
}

export function useRestTimer(userId: string): RestTimerControls {
  const [{ state, changedAt }, setTracked] = useState<Tracked>(() => readNow(userId));

  useEffect(() => {
    const followOtherTabs = (event: StorageEvent) => {
      if (event.key === restStateKey(userId)) setTracked(readNow(userId));
    };
    window.addEventListener('storage', followOtherTabs);
    return () => window.removeEventListener('storage', followOtherTabs);
  }, [userId]);

  const changeTimer = (timer: RestTimer | null) => {
    const next = { ...readRestState(deviceStorage(), userId), timer };
    setTracked({ state: next, changedAt: Date.now() });
    saveRestState(deviceStorage(), userId, next);
  };

  return {
    timer: state.timer,
    changedAt,
    start: (setId) => {
      const { restS } = readRestState(deviceStorage(), userId);
      if (restS !== REST_OFF) changeTimer(startRest(Date.now(), restS, setId));
    },
    adjust: (deltaS) => {
      if (state.timer) changeTimer(adjustRest(state.timer, deltaS, Date.now()));
    },
    stop: () => {
      if (state.timer) changeTimer(null);
    },
  };
}
