import { useEffect, useState } from 'react';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import {
  type ExerciseStrengthView,
  fetchExerciseStrength,
  fetchRecordBaseline,
  fetchStrengthState,
} from '../../lib/collection/collection-data.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { type SessionBaseline, sessionBaselineAsOf } from '../../lib/workout/session-baseline-rules.ts';
import { readSessionBaseline, saveSessionBaseline } from '../../lib/workout/session-baseline-store.ts';

export function useExerciseStrength(userId: string, draftSessionId: string | null) {
  const [strength, setStrength] = useState<Map<string, ExerciseStrengthView> | null>(null);

  useEffect(() => {
    let active = true;
    fetchExerciseStrength(userId).then(
      (loaded) => active && setStrength(loaded),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId, draftSessionId]);

  return strength;
}

export function useSessionBaseline(userId: string, draftStartedAt: string | null, onlineSignal: number) {
  const [loadedBaseline, setLoadedBaseline] = useState<SessionBaseline | null>(null);
  const [cachedBaseline] = useState(() => readSessionBaseline(deviceStorage(), userId));

  useEffect(() => {
    if (draftStartedAt === null) return;
    let active = true;
    const records = fetchRecordBaseline(userId).catch(() => null);
    fetchStrengthState(draftStartedAt, DEFAULT_BALANCE.e1rmWindowDays).then(
      async (strength) => {
        const baseline = { asOf: draftStartedAt, strength, records: await records };
        if (!active) return;
        saveSessionBaseline(deviceStorage(), userId, baseline);
        setLoadedBaseline(baseline);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId, draftStartedAt, onlineSignal]);

  return sessionBaselineAsOf(draftStartedAt, loadedBaseline, cachedBaseline);
}
