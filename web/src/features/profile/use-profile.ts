import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { loadProfileCacheFirst, type Profile } from '../../lib/profile.ts';
import { loadedState } from '../../lib/query-state-rules.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { profileCache } from '../../offline/profile-cache.ts';

export type ProfileState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'ready'; profile: Profile; fromCache: boolean };

export type ProfileUpdate = Profile | ((current: Profile) => Profile);

interface ProfileQuery {
  state: ProfileState;
  replace: (update: ProfileUpdate) => void;
  refresh: () => Promise<unknown>;
}

export function useProfile(userId: string): ProfileQuery {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['profile', userId], queryFn: () => loadProfileCacheFirst(userId) });

  const replace = useCallback(
    (change: ProfileUpdate) => {
      void queryClient.cancelQueries({ queryKey: ['profile', userId] });
      queryClient.setQueryData<CacheFirstLoad<Profile>>(['profile', userId], (current) => {
        if (current === undefined) return current;
        const profile = typeof change === 'function' ? change(current.loaded) : change;
        profileCache.save(deviceStorage(), userId, profile);
        return { ...current, loaded: profile };
      });
    },
    [queryClient, userId],
  );

  const state = loadedState(query.data, query.error);

  return {
    state:
      state.status === 'ready'
        ? { status: 'ready', profile: state.data.loaded, fromCache: state.data.fromCache }
        : state,
    replace,
    refresh: query.refetch,
  };
}
