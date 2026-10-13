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
  queryClient.setQueryData<CacheFirstLoad<Profile>>(
    profileQuery(userId).queryKey,
    (current) => current && { ...current, loaded: { ...current.loaded, bodyweightKg } },
  );
  void announceDataChange(queryClient, 'profile-saved');
}
