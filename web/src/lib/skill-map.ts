import { useQuery } from '@tanstack/react-query';
import { fetchExercises } from './catalog.ts';
import { readCachedExercises } from './catalog-cache.ts';
import { activeExercises, type Exercise } from './catalog-rules.ts';
import { type LoadedState, loadedState } from './query-state-rules.ts';
import { deviceStorage } from './keyed-store.ts';
import { skillPanelSeed } from './skill-map-rules.ts';

function cachedSeed(userId: string): Exercise[] | undefined {
  const storage = deviceStorage();
  const cached = storage && readCachedExercises(storage, userId);
  return cached ? skillPanelSeed(activeExercises(cached)) : undefined;
}

export function useActiveExercises(userId: string, enabled: boolean): LoadedState<Exercise[]> {
  const query = useQuery({
    queryKey: ['exercises', userId, 'active'],
    queryFn: () => fetchExercises({ includeArchived: false }),
    enabled,
    initialData: () => cachedSeed(userId),
    initialDataUpdatedAt: 0,
  });
  return loadedState(query.data, query.error);
}
