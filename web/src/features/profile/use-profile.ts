import { useCallback, useEffect, useState } from 'react';
import { fetchProfile, type Profile } from '../../lib/profile.ts';

export type ProfileState =
  { status: 'loading' } | { status: 'failed'; problem: string } | { status: 'ready'; profile: Profile };

export type ProfileUpdate = Profile | ((current: Profile) => Profile);

export function useProfile(userId: string): { state: ProfileState; replace: (update: ProfileUpdate) => void } {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchProfile(userId).then(
      (profile) => active && setState({ status: 'ready', profile }),
      (error: Error) => active && setState({ status: 'failed', problem: error.message }),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  const replace = useCallback(
    (update: ProfileUpdate) =>
      setState((current) =>
        current.status === 'ready'
          ? { status: 'ready', profile: typeof update === 'function' ? update(current.profile) : update }
          : current,
      ),
    [],
  );

  return { state, replace };
}
