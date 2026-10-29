import { useQuery } from '@tanstack/react-query';
import { lastWorkoutDateQuery } from '../../lib/query/queries.ts';
import { latestTrainedDate } from './highlight-rules.ts';
import { type PetMood, petMoodFrom } from './pet-mood-rules.ts';

export function usePetMood(
  userId: string,
  today: string | null,
  trainedDates: readonly string[] | undefined,
): PetMood | null {
  const lapsed = today !== null && trainedDates !== undefined && latestTrainedDate(trainedDates, today) === null;
  const olderWorkout = useQuery({ ...lastWorkoutDateQuery(userId, today ?? ''), enabled: lapsed });
  const olderWorkoutDate = olderWorkout.isSuccess ? olderWorkout.data : undefined;
  return petMoodFrom(today, trainedDates, olderWorkoutDate);
}
