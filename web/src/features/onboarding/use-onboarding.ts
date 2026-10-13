import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { onboardingDecision, trainingHistoryNow } from '../../lib/profile/onboarding-rules.ts';
import { readOnboarding, saveOnboardingDone } from '../../lib/profile/onboarding-store.ts';
import { trainingHistoryQuery } from '../../lib/query/queries.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';

export function useOnboarding(userId: string, hasDraft: boolean): { open: boolean; finish: () => void } {
  const [record, setRecord] = useState(() => readOnboarding(deviceStorage(), userId));
  const query = useQuery({ ...trainingHistoryQuery(userId), enabled: record.status === 'absent' && !hasDraft });
  const decision = onboardingDecision(
    record,
    trainingHistoryNow({ hasDraft, fetching: query.isFetching, fetched: query.data ?? null }),
  );

  const finish = () => {
    saveOnboardingDone(deviceStorage(), userId);
    setRecord({ status: 'done' });
  };

  useEffect(() => {
    if (decision === 'record') saveOnboardingDone(deviceStorage(), userId);
  }, [decision, userId]);

  return { open: decision === 'show', finish };
}
