import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { onboardingDecision, trainingHistoryNow } from '../../lib/onboarding-rules.ts';
import { readOnboarding, saveOnboardingDone } from '../../lib/onboarding-store.ts';
import { trainingHistoryQuery } from '../../lib/queries.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';

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
