import { useQuery } from '@tanstack/react-query';
import { fetchExercises, fetchSkills, fetchSkillXp } from './catalog.ts';
import { readCachedExercises } from './catalog-cache.ts';
import { type Exercise } from './catalog-rules.ts';
import { type LoadedState, loadedState } from './query-state-rules.ts';
import { type Standing, standingFrom } from './standing-rules.ts';

export async function fetchStanding(userId: string): Promise<Standing> {
  const [skills, xpBySkillId] = await Promise.all([fetchSkills(), fetchSkillXp(userId)]);
  return standingFrom(skills, xpBySkillId);
}

export type StandingState =
  { status: 'loading' } | { status: 'failed'; problem: string } | { status: 'ready'; standing: Standing };

export function useStanding(userId: string): StandingState {
  const query = useQuery({ queryKey: ['standing', userId], queryFn: () => fetchStanding(userId) });
  const state = loadedState(query.data, query.error);
  return state.status === 'ready' ? { status: 'ready', standing: state.data } : state;
}

export function useActiveExercises(userId: string, enabled: boolean): LoadedState<Exercise[]> {
  const query = useQuery({
    queryKey: ['exercises', userId, 'active'],
    queryFn: () => fetchExercises({ includeArchived: false }),
    enabled,
    initialData: () => readCachedExercises(localStorage, userId) ?? undefined,
  });
  return loadedState(query.data, query.error);
}
