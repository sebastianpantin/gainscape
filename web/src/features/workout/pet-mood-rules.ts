import { daysBetween } from '../../lib/ui/date-bucket-rules.ts';
import { latestTrainedDate } from './highlight-rules.ts';

export type PetMood = 'excited' | 'content' | 'sleepy';

export const CONTENT_FOR_DAYS = 3;

const SPOKEN_MOOD: Record<PetMood, string> = { excited: 'excited', content: 'happy', sleepy: 'sleepy' };

export function petMood(today: string, lastTrainedDate: string | null): PetMood {
  if (lastTrainedDate === null) return 'sleepy';
  const daysSince = daysBetween(lastTrainedDate, today);
  if (daysSince <= 0) return 'excited';
  return daysSince <= CONTENT_FOR_DAYS ? 'content' : 'sleepy';
}

export function lastTrainedDateFrom(
  today: string | null,
  trainedDates: readonly string[] | undefined,
  olderWorkoutDate: string | null | undefined,
): string | null | undefined {
  if (today === null || trainedDates === undefined) return undefined;
  return latestTrainedDate(trainedDates, today) ?? olderWorkoutDate;
}

export function petMoodFrom(today: string | null, lastTrainedDate: string | null | undefined): PetMood | null {
  return today === null || lastTrainedDate === undefined ? null : petMood(today, lastTrainedDate);
}

export function petCompanionLabel(petName: string, mood: PetMood | null): string {
  return mood === null ? `${petName}, your companion` : `${petName}, your companion, ${SPOKEN_MOOD[mood]}`;
}
