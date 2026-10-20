import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { type Profile } from '../../lib/profile/profile.ts';
import { profileQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_PROFILE_NOTICE, profileCache } from '../../offline/profile-cache.ts';

type ProfileState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'ready'; profile: Profile; notice: string | null };

export type ProfileUpdate = Profile | ((current: Profile) => Profile);

interface ProfileQuery {
  state: ProfileState;
  replace: (update: ProfileUpdate) => void;
  refresh: () => Promise<unknown>;
}

export function patchSavedProfile(queryClient: QueryClient, userId: string, change: ProfileUpdate): void {
  const { queryKey } = profileQuery(userId);
  void queryClient.cancelQueries({ queryKey });
  const current = queryClient.getQueryData(queryKey);
  const base = current?.loaded ?? profileCache.read(deviceStorage(), userId);
  if (!base) return;
  const profile = typeof change === 'function' ? change(base) : change;
  profileCache.save(deviceStorage(), userId, profile);
  if (current) queryClient.setQueryData(queryKey, { ...current, loaded: profile });
}

export function useProfile(userId: string): ProfileQuery {
  const queryClient = useQueryClient();
  const query = useQuery(profileQuery(userId));

  const replace = useCallback(
    (change: ProfileUpdate) => patchSavedProfile(queryClient, userId, change),
    [queryClient, userId],
  );

  const state = loadedState(query.data, query.error);

  return {
    state:
      state.status === 'ready'
        ? { status: 'ready', profile: state.data.loaded, notice: cacheFirstNotice(state.data, OFFLINE_PROFILE_NOTICE) }
        : state,
    replace,
    refresh: query.refetch,
  };
}
