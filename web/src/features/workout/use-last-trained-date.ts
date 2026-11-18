import { useQuery } from '@tanstack/react-query';
import { lastWorkoutDateQuery } from '../../lib/query/queries.ts';
import { latestTrainedDate } from './highlight-rules.ts';
import { lastTrainedDateFrom } from './pet-mood-rules.ts';

export function useLastTrainedDate(
  userId: string,
  today: string | null,
  trainedDates: readonly string[] | undefined,
): string | null | undefined {
  const lapsed = today !== null && trainedDates !== undefined && latestTrainedDate(trainedDates, today) === null;
  const olderWorkout = useQuery({ ...lastWorkoutDateQuery(userId, today ?? ''), enabled: lapsed });
  return lastTrainedDateFrom(today, trainedDates, olderWorkout.isSuccess ? olderWorkout.data : undefined);
}
