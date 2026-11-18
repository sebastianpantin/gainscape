import { type CharacterPose } from '../../components/character-sprites.ts';
import { daysBetween, newestDate } from '../../lib/ui/date-bucket-rules.ts';
import { CONTENT_FOR_DAYS } from './pet-mood-rules.ts';

export function characterPose(
  today: string,
  lastTrainedDate: string | null,
  latestRecordDate: string | null,
): CharacterPose {
  if (latestRecordDate !== null && daysBetween(latestRecordDate, today) <= 0) return 'flexing';
  if (lastTrainedDate === null) return 'idle';
  const daysSince = daysBetween(lastTrainedDate, today);
  if (daysSince <= 0) return 'lifting';
  return daysSince > CONTENT_FOR_DAYS ? 'resting' : 'idle';
}

export function characterPoseFrom(
  today: string | null,
  lastTrainedDate: string | null | undefined,
  recordDates: readonly string[] | undefined,
): CharacterPose {
  if (today === null || lastTrainedDate === undefined || recordDates === undefined) return 'idle';
  return characterPose(today, lastTrainedDate, newestDate(recordDates));
}
