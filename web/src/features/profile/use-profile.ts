import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchProfile, type Profile } from '../../lib/profile.ts';
import { loadedState } from '../../lib/query-state-rules.ts';

export type ProfileState =
  { status: 'loading' } | { status: 'failed'; problem: string } | { status: 'ready'; profile: Profile };

export type ProfileUpdate = Profile | ((current: Profile) => Profile);

interface ProfileQuery {
  state: ProfileState;
  replace: (update: ProfileUpdate) => void;
  refresh: () => Promise<unknown>;
}

export function useProfile(userId: string): ProfileQuery {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['profile', userId], queryFn: () => fetchProfile(userId) });

  const replace = useCallback(
    (change: ProfileUpdate) => {
      void queryClient.cancelQueries({ queryKey: ['profile', userId] });
      queryClient.setQueryData<Profile>(['profile', userId], (current) =>
        current === undefined ? current : typeof change === 'function' ? change(current) : change,
      );
    },
    [queryClient, userId],
  );

  const state = loadedState(query.data, query.error);

  return {
    state: state.status === 'ready' ? { status: 'ready', profile: state.data } : state,
    replace,
    refresh: query.refetch,
  };
}
