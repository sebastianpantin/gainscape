import { useEffect, useMemo, useState } from 'react';
import { refreshProgramCache } from '../../lib/program-enrollment.ts';
import { programLoadStatus, type ProgramRefreshState, programStatusText } from '../../lib/program-status-rules.ts';
import { activeProgram } from '../../lib/program-today-rules.ts';
import { type ProgramCache, readProgramCache } from '../../offline/program-cache.ts';
import { cachedProgramFacts } from '../../offline/program-facts-cache.ts';

export function useActiveProgram(userId: string) {
  const [cache, setCache] = useState<ProgramCache>(() => readProgramCache(localStorage, userId));
  const [refresh, setRefresh] = useState<ProgramRefreshState>('pending');

  useEffect(() => {
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
  }, [userId]);

  const program = useMemo(
    () => activeProgram(cache.templates, cache.enrollment, cache.facts ? cachedProgramFacts(cache.facts) : []),
    [cache],
  );
  const loadStatus = programLoadStatus({ hasCachedEnrollment: cache.enrollment !== null, refresh });
  return { cache, program, loadStatus, statusText: programStatusText(loadStatus), showCache: setCache };
}
