import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { type Profile } from '../../lib/profile/profile.ts';
import { profileQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_PROFILE_NOTICE } from '../../offline/profile-cache.ts';
import { patchSavedProfile, type ProfileUpdate } from '../../lib/profile/saved-profile.ts';

type ProfileState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'ready'; profile: Profile; notice: string | null };

interface ProfileQuery {
  state: ProfileState;
  replace: (update: ProfileUpdate) => void;
  refresh: () => Promise<unknown>;
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
