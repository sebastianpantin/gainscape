import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { type SavedStanding, standingCache } from '../../offline/standing-cache.ts';
import { fetchSkills, fetchSkillXp } from '../exercises/catalog.ts';
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
