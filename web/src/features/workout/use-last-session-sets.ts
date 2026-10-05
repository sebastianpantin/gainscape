import { useCallback, useEffect, useState } from 'react';
import { fetchLastSessionSets } from '../../lib/last-session.ts';
import type { LastLoggedSet } from '../../offline/draft-format.ts';

const LAST_SESSION_TIMEOUT_MS = 3000;

export interface LastSessionSets {
  byExercise: ReadonlyMap<string, readonly LastLoggedSet[]>;
  loadFor: (exerciseId: string) => Promise<readonly LastLoggedSet[] | undefined>;
}

export function useLastSessionSets(
  userId: string,
  exerciseIds: readonly string[],
  onlineSignal: number,
): LastSessionSets {
  const [loaded, setLoaded] = useState<{ userId: string; sets: Map<string, LastLoggedSet[]> }>({
    userId,
    sets: new Map(),
  });
  const byExercise = loaded.userId === userId ? loaded.sets : new Map<string, LastLoggedSet[]>();

  const remember = useCallback(
    (requested: readonly string[], found: Map<string, LastLoggedSet[]>) =>
      setLoaded((previous) => {
        const sets = previous.userId === userId ? new Map(previous.sets) : new Map<string, LastLoggedSet[]>();
        for (const id of requested) sets.set(id, found.get(id) ?? []);
        return { userId, sets };
      }),
    [userId],
  );

  const missingKey = [...new Set(exerciseIds)]
    .filter((id) => !byExercise.has(id))
    .sort()
    .join(',');

  useEffect(() => {
    if (missingKey === '' || navigator.onLine === false) return;
    const requested = missingKey.split(',');
    let active = true;
    fetchLastSessionSets(requested, AbortSignal.timeout(LAST_SESSION_TIMEOUT_MS)).then(
      (found) => active && remember(requested, found),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [missingKey, remember, onlineSignal]);

  const loadFor = async (exerciseId: string) => {
    if (byExercise.has(exerciseId)) return byExercise.get(exerciseId);
    if (navigator.onLine === false) return undefined;
    try {
      const found = await fetchLastSessionSets([exerciseId], AbortSignal.timeout(LAST_SESSION_TIMEOUT_MS));
      remember([exerciseId], found);
      return found.get(exerciseId);
    } catch {
      return undefined;
    }
  };

  return { byExercise, loadFor };
}
