import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type BodyStatus, bodyStatusFrom } from '../../lib/progress/body-status-rules.ts';
import { exerciseListQuery, profileQuery, recentSetsQuery } from '../../lib/query/queries.ts';

export function useBodyStatus(userId: string): BodyStatus {
  const recent = useQuery(recentSetsQuery(userId));
  const exercises = useQuery(exerciseListQuery(userId));
  const profile = useQuery(profileQuery(userId));
  const [openedAt] = useState(Date.now);
  return bodyStatusFrom({
    recent: { data: recent.data, error: recent.error, updatedAt: recent.dataUpdatedAt },
    exercises: { data: exercises.data, error: exercises.error },
    profile: { data: profile.data?.loaded, error: profile.error },
    openedAt,
  });
}
