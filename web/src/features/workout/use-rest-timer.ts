import { useEffect, useState } from 'react';
import {
  adjustRest,
  rememberAdjustedRest,
  REST_OFF,
  restLengthFor,
  type RestState,
  type RestTimer,
  startRest,
} from '../../lib/rest-timer-rules.ts';
import { deviceStorage, readRestState, restStateKey, saveRestState } from '../../lib/rest-timer-store.ts';
import { readTrainingDeviceSettings } from '../../lib/training-device-store.ts';
import { primeRestSound } from './rest-alert-effects.ts';

export interface RestTimerControls {
  timer: RestTimer | null;
  changedAt: number;
  lengthFor: (exerciseId: string, compound: boolean) => number;
  start: (setId: string, exerciseId: string, compound: boolean) => void;
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

  const changeTimer = (timer: RestTimer | null, remember = false) => {
    const latest = { ...readRestState(deviceStorage(), userId), timer };
    const next = remember && timer ? rememberAdjustedRest(latest, timer) : latest;
    setTracked({ state: next, changedAt: Date.now() });
    saveRestState(deviceStorage(), userId, next);
  };

  return {
    timer: state.timer,
    changedAt,
    lengthFor: (exerciseId, compound) => restLengthFor(state, exerciseId, compound),
    start: (setId, exerciseId, compound) => {
      const restS = restLengthFor(readRestState(deviceStorage(), userId), exerciseId, compound);
      if (restS === REST_OFF) return;
      if (readTrainingDeviceSettings(deviceStorage(), userId).sound) primeRestSound();
      changeTimer(startRest(Date.now(), restS, setId, exerciseId));
    },
    adjust: (deltaS) => {
      if (state.timer) changeTimer(adjustRest(state.timer, deltaS, Date.now()), true);
    },
    stop: () => {
      if (state.timer) changeTimer(null);
    },
  };
}
