import type { QueryClient } from '@tanstack/react-query';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { type Profile, updatePrivateProfile } from '../../lib/profile/profile.ts';
import { profileQuery } from '../../lib/query/queries.ts';
import type { CacheFirstLoad } from '../../offline/cache-first.ts';
import { rememberSavedBodyweight } from '../../offline/profile-cache.ts';

interface BodyweightSave {
  userId: string;
  bodyweightKg: number;
  storage: Storage | null;
  queryClient: QueryClient;
}

export async function saveBodyweight({ userId, bodyweightKg, storage, queryClient }: BodyweightSave): Promise<void> {
  await updatePrivateProfile(userId, { bodyweightKg });
  rememberSavedBodyweight(storage, userId, bodyweightKg);
  const { queryKey } = profileQuery(userId);
  const current = queryClient.getQueryData<CacheFirstLoad<Profile>>(queryKey);
  if (current) queryClient.setQueryData(queryKey, { ...current, loaded: { ...current.loaded, bodyweightKg } });
  else void queryClient.invalidateQueries({ queryKey });
  void announceDataChange(queryClient, 'profile-saved');
}
