import { useQuery } from '@tanstack/react-query';
import { fetchSkills, fetchSkillXp } from './catalog.ts';
import { loadedState } from './query-state-rules.ts';
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
