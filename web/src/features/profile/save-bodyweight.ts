import type { QueryClient } from '@tanstack/react-query';
import { updatePrivateProfile } from '../../lib/profile/profile.ts';
import { wrote } from '../../lib/query/writes.ts';
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
  void wrote(queryClient, {
    change: 'profile-saved',
    profile: { userId, update: (profile) => ({ ...profile, bodyweightKg }) },
  });
}
