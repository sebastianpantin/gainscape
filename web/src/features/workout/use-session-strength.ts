import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import {
  type ExerciseStrengthView,
  fetchRecordBaseline,
  fetchStrengthState,
} from '../../lib/collection/collection-data.ts';
import { strengthQuery } from '../../lib/query/queries.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { type SessionBaseline, sessionBaselineAsOf } from '../../lib/workout/session-baseline-rules.ts';
import { readSessionBaseline, saveSessionBaseline } from '../../lib/workout/session-baseline-store.ts';

export function useExerciseStrength(userId: string): Map<string, ExerciseStrengthView> | null {
  return useQuery(strengthQuery(userId)).data ?? null;
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
