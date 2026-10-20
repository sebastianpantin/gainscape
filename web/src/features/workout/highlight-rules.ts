import { MS_PER_DAY } from '@domain/math.ts';

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / MS_PER_DAY);
}

export function lastWorkoutText(trainedDates: readonly string[], today: string): string | null {
  const latest = trainedDates
    .filter((date) => date <= today)
    .reduce<string | null>((newest, date) => (newest === null || date > newest ? date : newest), null);
  if (latest === null) return null;
  const days = daysBetween(latest, today);
  if (days === 0) return 'Today';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}
