import { useEffect, useMemo, useState } from 'react';
import { refreshProgramCache } from '../../lib/program-enrollment.ts';
import { activeProgram } from '../../lib/program-today-rules.ts';
import { type ProgramCache, readProgramCache } from '../../offline/program-cache.ts';
import { cachedProgramFacts } from '../../offline/program-facts-cache.ts';

export function useActiveProgram(userId: string) {
  const [cache, setCache] = useState<ProgramCache>(() => readProgramCache(localStorage, userId));

  useEffect(() => {
    let active = true;
    refreshProgramCache(userId).then(
      (refreshed) => active && setCache(refreshed),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId]);

  const program = useMemo(
    () => activeProgram(cache.templates, cache.enrollment, cache.facts ? cachedProgramFacts(cache.facts) : []),
    [cache],
  );
  return { cache, program, showCache: setCache };
}
