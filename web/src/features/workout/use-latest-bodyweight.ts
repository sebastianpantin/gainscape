import { useEffect, useState } from 'react';
import { fetchProfile } from '../../lib/profile.ts';
import { deviceStorage } from '../../lib/keyed-store.ts';
import { isDeviceOffline } from '../../offline/cache-first.ts';
import { profileCache } from '../../offline/profile-cache.ts';

export function useLatestBodyweight(userId: string, onlineSignal: number) {
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(
    () => profileCache.read(deviceStorage(), userId)?.bodyweightKg ?? null,
  );

  useEffect(() => {
    if (isDeviceOffline()) return;
    let active = true;
    fetchProfile(userId).then(
      (profile) => active && setBodyweightKg(profile.bodyweightKg),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId, onlineSignal]);

  return [bodyweightKg, setBodyweightKg] as const;
}
