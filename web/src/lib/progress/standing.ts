import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  type CacheFirstLoad,
  cacheFirstNotice,
  isDeviceOffline,
  loadCacheFirstWhenOffline,
} from '../../offline/cache-first.ts';
import { OFFLINE_SKILLS_NOTICE, type SavedStanding, standingCache } from '../../offline/standing-cache.ts';
import { fetchSkills, fetchSkillXp } from '../exercises/catalog.ts';
import { loadedState } from '../query/query-state-rules.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { type Standing, standingFrom } from './standing-rules.ts';

async function fetchSavedStanding(userId: string): Promise<SavedStanding> {
  const [skills, xpBySkillId] = await Promise.all([fetchSkills(), fetchSkillXp(userId)]);
  const saved = { skills, xpBySkillId: Object.fromEntries(xpBySkillId) };
  standingCache.save(deviceStorage(), userId, saved);
  return saved;
}

export async function loadStanding(userId: string): Promise<CacheFirstLoad<Standing>> {
  const load = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => standingCache.read(deviceStorage(), userId),
    () => fetchSavedStanding(userId),
  );
  return { ...load, loaded: standingFrom(load.loaded.skills, new Map(Object.entries(load.loaded.xpBySkillId))) };
}

export type StandingState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'ready'; standing: Standing; notice: string | null };

export function standingQuery(userId: string) {
  return queryOptions({ queryKey: ['standing', userId] as const, queryFn: () => loadStanding(userId) });
}

export function useStanding(userId: string): StandingState {
  const query = useQuery(standingQuery(userId));
  const state = loadedState(query.data, query.error);
  return state.status === 'ready'
    ? { status: 'ready', standing: state.data.loaded, notice: cacheFirstNotice(state.data, OFFLINE_SKILLS_NOTICE) }
    : state;
}
