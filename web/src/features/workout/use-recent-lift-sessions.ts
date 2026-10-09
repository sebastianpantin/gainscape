import { useCallback, useEffect, useState } from 'react';
import { fetchRecentLiftSessions } from '../../lib/last-session.ts';
import type { RecentSessions, RecentSet } from '../../lib/last-session-rules.ts';
import { isDeviceOffline } from '../../offline/cache-first.ts';

const RECENT_SESSIONS_TIMEOUT_MS = 3000;

export interface RecentLiftSessions {
  byExercise: ReadonlyMap<string, RecentSessions>;
  loadFor: (exerciseId: string) => Promise<RecentSessions | undefined>;
}

export function useRecentLiftSessions(
  scope: string,
  exerciseIds: readonly string[],
  onlineSignal: number,
): RecentLiftSessions {
  const [loaded, setLoaded] = useState<{ scope: string; sets: Map<string, RecentSet[][]> }>({
    scope,
    sets: new Map(),
  });
  const byExercise = loaded.scope === scope ? loaded.sets : new Map<string, RecentSet[][]>();

  const remember = useCallback(
    (requested: readonly string[], found: Map<string, RecentSet[][]>) =>
      setLoaded((previous) => {
        const sets = previous.scope === scope ? new Map(previous.sets) : new Map<string, RecentSet[][]>();
        for (const id of requested) sets.set(id, found.get(id) ?? []);
        return { scope, sets };
      }),
    [scope],
  );

  const missingKey = [...new Set(exerciseIds)]
    .filter((id) => !byExercise.has(id))
    .sort()
    .join(',');

  useEffect(() => {
    if (missingKey === '' || isDeviceOffline()) return;
    const requested = missingKey.split(',');
    let active = true;
    fetchRecentLiftSessions(requested, AbortSignal.timeout(RECENT_SESSIONS_TIMEOUT_MS)).then(
      (found) => active && remember(requested, found),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [missingKey, remember, onlineSignal]);

  const loadFor = async (exerciseId: string) => {
    if (byExercise.has(exerciseId)) return byExercise.get(exerciseId);
    if (isDeviceOffline()) return undefined;
    try {
      const found = await fetchRecentLiftSessions([exerciseId], AbortSignal.timeout(RECENT_SESSIONS_TIMEOUT_MS));
      remember([exerciseId], found);
      return found.get(exerciseId);
    } catch {
      return undefined;
    }
  };

  return { byExercise, loadFor };
}
