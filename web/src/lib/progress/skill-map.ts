import { useQuery } from '@tanstack/react-query';
import { type Exercise } from '../exercises/catalog-rules.ts';
import { exerciseListQuery } from '../query/queries.ts';
import { type LoadedState, loadedState } from '../query/query-state-rules.ts';

export function useSkillMapExercises(userId: string): LoadedState<Exercise[]> {
  const query = useQuery(exerciseListQuery(userId));
  return loadedState(query.data, query.error);
}
