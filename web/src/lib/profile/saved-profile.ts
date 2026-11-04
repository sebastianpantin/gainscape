import { type QueryClient } from '@tanstack/react-query';
import { deviceStorage } from '../platform/keyed-store.ts';
import { profileQuery } from '../query/queries.ts';
import { profileCache } from '../../offline/profile-cache.ts';
import { type Profile } from './profile.ts';

export type ProfileUpdate = Profile | ((current: Profile) => Profile);

export function patchSavedProfile(queryClient: QueryClient, userId: string, change: ProfileUpdate): boolean {
  const { queryKey } = profileQuery(userId);
  void queryClient.cancelQueries({ queryKey });
  const current = queryClient.getQueryData(queryKey);
  const base = current?.loaded ?? profileCache.read(deviceStorage(), userId);
  if (!base) return false;
  const profile = typeof change === 'function' ? change(base) : change;
  profileCache.save(deviceStorage(), userId, profile);
  if (!current) return false;
  queryClient.setQueryData(queryKey, { ...current, loaded: profile });
  return true;
}
