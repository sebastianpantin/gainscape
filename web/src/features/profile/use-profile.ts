import { useCallback, useEffect, useState } from 'react';
import { fetchCollectionPercent } from '../../lib/collection-data.ts';
import { fetchProfile, type Profile } from '../../lib/profile.ts';
import { fetchStanding, type Standing } from '../../lib/standing.ts';

export interface ProfileBundle {
  profile: Profile;
  standing: Standing | null;
  collectionPercent: number | null;
}

export type ProfileState =
  { status: 'loading' } | { status: 'failed'; problem: string } | { status: 'ready'; bundle: ProfileBundle };

export type ProfileUpdate = Profile | ((current: Profile) => Profile);

export function useProfile(userId: string): { state: ProfileState; replace: (update: ProfileUpdate) => void } {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchProfile(userId),
      fetchStanding(userId).catch(() => null),
      fetchCollectionPercent(userId).catch(() => null),
    ]).then(
      ([profile, standing, collectionPercent]) =>
        active && setState({ status: 'ready', bundle: { profile, standing, collectionPercent } }),
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
          ? {
              status: 'ready',
              bundle: {
                ...current.bundle,
                profile: typeof update === 'function' ? update(current.bundle.profile) : update,
              },
            }
          : current,
      ),
    [],
  );

  return { state, replace };
}
