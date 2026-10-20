import { z } from 'zod';
import {
  BADGE_COLOR_KEYS,
  EFFORT_INPUT_MODES,
  type Profile,
  SEXES,
  TRAINING_FOCUSES,
  UNIT_PREFS,
} from '../lib/profile/profile-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_PROFILE_NOTICE = 'Offline: using your saved profile.';

const profileSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  trainingFocus: z.enum(TRAINING_FOCUSES).nullable(),
  trainingSince: z.number().nullable(),
  badgeColor: z.enum(BADGE_COLOR_KEYS),
  showWeights: z.boolean(),
  showBodyweight: z.boolean(),
  createdAt: z.string(),
  bodyweightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  birthYear: z.number().nullable(),
  sex: z.enum(SEXES).nullable().default(null),
  unitPref: z.enum(UNIT_PREFS),
  effortInputMode: z.enum(EFFORT_INPUT_MODES),
  timezone: z.string(),
  timezoneChangedAt: z.string().nullable(),
});

export const profileCache = userCache<Profile>('gainscape.profile.v1.', profileSchema);

export function rememberSavedBodyweight(storage: Storage | null, userId: string, bodyweightKg: number): void {
  const saved = profileCache.read(storage, userId);
  if (saved) profileCache.save(storage, userId, { ...saved, bodyweightKg });
}
