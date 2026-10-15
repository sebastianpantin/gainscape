import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { latestBodyweightQuery } from '../../lib/query/queries.ts';
import { profileCache } from '../../offline/profile-cache.ts';

export function useLatestBodyweight(userId: string): number | null {
  const [savedBodyweightKg] = useState(() => profileCache.read(deviceStorage(), userId)?.bodyweightKg ?? null);
  const { data } = useQuery(latestBodyweightQuery(userId));
  return data === undefined ? savedBodyweightKg : data;
}
