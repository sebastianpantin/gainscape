import { useQuery } from '@tanstack/react-query';
import { type Exercise } from '../exercises/catalog-rules.ts';
import { exerciseListQuery } from '../query/queries.ts';
import { loadedState } from '../query/query-state-rules.ts';

export type SkillMapExercises =
  | { status: 'loading' }
  | { status: 'failed'; problem: string; retry: () => Promise<unknown> }
  | { status: 'ready'; data: Exercise[] };

export function useSkillMapExercises(userId: string): SkillMapExercises {
  const query = useQuery(exerciseListQuery(userId));
  const state = loadedState(query.data, query.error);
  return state.status === 'failed' ? { ...state, retry: query.refetch } : state;
}
