import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { messageOf } from '../../lib/error-text.ts';
import { previousValues, type Profile } from '../../lib/profile/profile-rules.ts';
import type { ProfileUpdate } from './use-profile.ts';

interface OptimisticProfileSave<K extends keyof Profile> {
  save: (changes: Partial<Pick<Profile, K>>) => Promise<void>;
  pending: boolean;
  problem: string | null;
}

export function useOptimisticProfileSave<K extends keyof Profile>(
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
    replace((current) => ({ ...current, ...changes }));
    mirror(changes);
    try {
      await persist(changes);
      void announceDataChange(queryClient, 'profile-saved');
    } catch (error) {
      replace((current) => ({ ...current, ...previous }));
      mirror(previous);
      setProblem(messageOf(error, 'Could not save that setting.'));
    }
    setPending(false);
  };

  return { save, pending, problem };
}
