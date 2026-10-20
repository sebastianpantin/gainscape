import { daysBetween } from '../../lib/ui/date-bucket-rules.ts';

export function latestTrainedDate(trainedDates: readonly string[], today: string): string | null {
  return trainedDates
    .filter((date) => date <= today)
    .reduce<string | null>((newest, date) => (newest === null || date > newest ? date : newest), null);
}

export function lastWorkoutText(
  trainedDates: readonly string[],
  today: string,
  olderWorkoutDate: string | null,
): string | null {
  const latest = latestTrainedDate(trainedDates, today) ?? olderWorkoutDate;
  if (latest === null) return null;
  const days = daysBetween(latest, today);
  if (days === 0) return 'Today';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
