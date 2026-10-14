import { useQuery } from '@tanstack/react-query';
import { fetchExercises } from '../exercises/catalog.ts';
import { readCachedExercises } from '../exercises/catalog-cache.ts';
import { activeExercises, type Exercise } from '../exercises/catalog-rules.ts';
import { type LoadedState, loadedState } from '../query/query-state-rules.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { skillPanelSeed } from './skill-map-rules.ts';

function cachedSeed(userId: string): Exercise[] | undefined {
  const storage = deviceStorage();
  const cached = storage && readCachedExercises(storage, userId);
  return cached ? skillPanelSeed(activeExercises(cached)) : undefined;
}

export function useActiveExercises(userId: string): LoadedState<Exercise[]> {
  const query = useQuery({
    queryKey: ['exercises', userId, 'active'],
    queryFn: () => fetchExercises({ includeArchived: false }),
    initialData: () => cachedSeed(userId),
    initialDataUpdatedAt: 0,
  });
  return loadedState(query.data, query.error);
}
