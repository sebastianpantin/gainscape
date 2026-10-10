import type { QueryClient } from '@tanstack/react-query';
import { type Profile, updatePrivateProfile } from '../../lib/profile.ts';
import { profileQuery } from '../../lib/queries.ts';
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
}
