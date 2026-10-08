import { useQuery } from '@tanstack/react-query';
import { fetchExercises } from './catalog.ts';
import { readCachedExercises } from './catalog-cache.ts';
import { type Exercise } from './catalog-rules.ts';
import { type LoadedState, loadedState } from './query-state-rules.ts';
import { deviceStorage } from './rest-timer-store.ts';
import { skillPanelSeed } from './skill-map-rules.ts';

function cachedSeed(userId: string): Exercise[] | undefined {
  const storage = deviceStorage();
  return storage ? skillPanelSeed(readCachedExercises(storage, userId)) : undefined;
}

export function useActiveExercises(userId: string, enabled: boolean): LoadedState<Exercise[]> {
  const query = useQuery({
    queryKey: ['exercises', userId, 'active'],
    queryFn: () => fetchExercises({ includeArchived: false }),
    enabled,
    initialData: () => cachedSeed(userId),
  });
  return loadedState(query.data, query.error);
}
