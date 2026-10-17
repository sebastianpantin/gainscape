import { useQuery } from '@tanstack/react-query';
import { liftGoalsQuery, profileQuery } from '../query/queries.ts';
import { liftGoalStatuses, todayLocalDate } from './lift-goal-rules.ts';

export function useLiftGoals(userId: string) {
  const load = useQuery(liftGoalsQuery(userId));
  const profile = useQuery(profileQuery(userId)).data?.loaded;
  return {
    statuses: load.data && liftGoalStatuses(load.data.goals, load.data.repMaxes, profile?.bodyweightKg ?? null),
    error: load.error,
    today: todayLocalDate(new Date(), profile?.timezone),
  };
}
