import { useQuery } from '@tanstack/react-query';
import { readCachedExercises } from '../exercises/catalog-cache.ts';
import { type Exercise } from '../exercises/catalog-rules.ts';
import { exerciseListQuery } from '../query/queries.ts';
import { type LoadedState, loadedState } from '../query/query-state-rules.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { skillPanelSeed } from './skill-map-rules.ts';

function cachedSeed(userId: string): Exercise[] | undefined {
  const storage = deviceStorage();
  return skillPanelSeed(storage && readCachedExercises(storage, userId));
}

export function useSkillMapExercises(userId: string): LoadedState<Exercise[]> {
  const query = useQuery({
    ...exerciseListQuery(userId),
    initialData: () => cachedSeed(userId),
    initialDataUpdatedAt: 0,
  });
  return loadedState(query.data, query.error);
}
