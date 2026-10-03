import { type LastLoggedWeights } from '@domain/index.ts';
import { useEffect, useState } from 'react';
import { type ActiveProgram } from '../../lib/program-today-rules.ts';
import { fetchLastLoggedSets } from '../../lib/programs.ts';

function boundExerciseIds(program: ActiveProgram): string[] {
  if (program.kind !== 'ready') return [];
  return [...new Set(Object.values(program.enrollment.bindings).filter((id) => id !== null))].sort();
}

export function useLastLoggedWeights(program: ActiveProgram): LastLoggedWeights {
  const [weights, setWeights] = useState<LastLoggedWeights>({});
  const idsKey = boundExerciseIds(program).join(',');

  useEffect(() => {
    if (idsKey === '') return;
    let active = true;
    fetchLastLoggedSets(idsKey.split(',')).then(
      (lastSets) => active && setWeights(Object.fromEntries([...lastSets].map(([id, set]) => [id, set.weightKg]))),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [idsKey]);

  return weights;
}
