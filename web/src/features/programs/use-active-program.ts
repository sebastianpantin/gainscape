import { useEffect, useMemo, useState } from 'react';
import { refreshProgramCache } from '../../lib/programs/program-enrollment.ts';
import {
  offlineRefreshState,
  programLoadStatus,
  type ProgramRefreshState,
  programStatusText,
} from '../../lib/programs/program-status-rules.ts';
import { activeProgram } from '../../lib/programs/program-today-rules.ts';
import { useOnlineSignal } from '../../lib/platform/use-online.ts';
import { isDeviceOffline } from '../../offline/cache-first.ts';
import { type ProgramCache, readProgramCache } from '../../offline/program-cache.ts';
import { cachedProgramFacts } from '../../offline/program-facts-cache.ts';

export function useActiveProgram(userId: string) {
  const [cache, setCache] = useState<ProgramCache>(() => readProgramCache(localStorage, userId));
  const [refresh, setRefresh] = useState<ProgramRefreshState>(() =>
    isDeviceOffline() ? offlineRefreshState(cache) : 'pending',
  );

  const onlineSignal = useOnlineSignal();

  useEffect(() => {
    if (isDeviceOffline()) return;
    let active = true;
    refreshProgramCache(userId).then(
      (refreshed) => {
        if (!active) return;
        setCache(refreshed);
        setRefresh('done');
      },
      () => active && setRefresh('failed'),
    );
    return () => {
      active = false;
    };
  }, [userId, onlineSignal]);

  const program = useMemo(
    () => activeProgram(cache.templates, cache.enrollment, cache.facts ? cachedProgramFacts(cache.facts) : []),
    [cache],
  );
  const loadStatus = programLoadStatus({ hasCachedEnrollment: cache.enrollment !== null, refresh });
  return { cache, program, loadStatus, statusText: programStatusText(loadStatus), showCache: setCache };
}
