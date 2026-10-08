import { useQuery } from '@tanstack/react-query';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../offline/cache-first.ts';
import { type SavedStanding, standingCache } from '../offline/standing-cache.ts';
import { fetchSkills, fetchSkillXp } from './catalog.ts';
import { loadedState } from './query-state-rules.ts';
import { deviceStorage } from './rest-timer-store.ts';
import { type Standing, standingFrom } from './standing-rules.ts';

async function fetchSavedStanding(userId: string): Promise<SavedStanding> {
  const [skills, xpBySkillId] = await Promise.all([fetchSkills(), fetchSkillXp(userId)]);
  const saved = { skills, xpBySkillId: Object.fromEntries(xpBySkillId) };
  standingCache.save(deviceStorage(), userId, saved);
  return saved;
}

export async function loadStanding(userId: string): Promise<{ standing: Standing; fromCache: boolean }> {
  const { loaded, fromCache } = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => standingCache.read(deviceStorage(), userId),
    () => fetchSavedStanding(userId),
  );
  return { standing: standingFrom(loaded.skills, new Map(Object.entries(loaded.xpBySkillId))), fromCache };
}

export type StandingState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'ready'; standing: Standing; fromCache: boolean };

export function useStanding(userId: string): StandingState {
  const query = useQuery({ queryKey: ['standing', userId], queryFn: () => loadStanding(userId) });
  const state = loadedState(query.data, query.error);
  return state.status === 'ready' ? { status: 'ready', ...state.data } : state;
}
