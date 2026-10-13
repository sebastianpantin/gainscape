import { type LastLoggedWeights } from '@domain/index.ts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ActiveProgram } from '../../lib/programs/program-today-rules.ts';
import { lastLoggedWeightsQuery } from '../../lib/query/queries.ts';

const NO_WEIGHTS: LastLoggedWeights = {};

function boundExerciseIds(program: ActiveProgram): string[] {
  if (program.kind !== 'ready') return [];
  return [...new Set(Object.values(program.enrollment.bindings).filter((id) => id !== null))].sort();
}

export function useLastLoggedWeights(program: ActiveProgram): LastLoggedWeights {
  const query = useQuery({ ...lastLoggedWeightsQuery(boundExerciseIds(program)), placeholderData: keepPreviousData });
  return query.data ?? NO_WEIGHTS;
}
