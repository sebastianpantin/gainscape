import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { wrote } from '../../lib/query/writes.ts';
import { messageOf } from '../../lib/error-text.ts';
import { previousValues, type Profile } from '../../lib/profile/profile-rules.ts';
import type { ProfileUpdate } from '../../lib/profile/saved-profile.ts';

interface OptimisticProfileSave<K extends keyof Profile> {
  save: (changes: Partial<Pick<Profile, K>>) => Promise<void>;
  pending: boolean;
  problem: string | null;
}

export function useOptimisticProfileSave<K extends keyof Profile>(
  userId: string,
  profile: Profile,
  replace: (update: ProfileUpdate) => void,
  persist: (changes: Partial<Pick<Profile, K>>) => Promise<void>,
  mirror: (changes: Partial<Pick<Profile, K>>) => void = () => undefined,
): OptimisticProfileSave<K> {
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (changes: Partial<Pick<Profile, K>>) => {
    const previous = previousValues(profile, changes);
    setProblem(null);
    setPending(true);
    const applied = (current: Profile) => ({ ...current, ...changes });
    replace(applied);
    mirror(changes);
    try {
      await persist(changes);
      void wrote(queryClient, { change: 'profile-saved', profile: { userId, update: applied } });
    } catch (error) {
      replace((current) => ({ ...current, ...previous }));
      mirror(previous);
      setProblem(messageOf(error, 'Could not save that setting.'));
    }
    setPending(false);
  };

  return { save, pending, problem };
}
