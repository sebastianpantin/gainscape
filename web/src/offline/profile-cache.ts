import { z } from 'zod';
import { type Profile } from '../lib/profile-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_PROFILE_NOTICE = 'Offline: using your saved profile.';

const profileSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  trainingFocus: z.enum(['strength', 'muscle', 'powerlifting', 'general']).nullable(),
  trainingSince: z.number().nullable(),
  badgeColor: z.enum(['gold', 'blue', 'green', 'rust', 'stone']),
  showWeights: z.boolean(),
  showBodyweight: z.boolean(),
  createdAt: z.string(),
  bodyweightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  birthYear: z.number().nullable(),
  unitPref: z.enum(['kg', 'lb']),
  effortInputMode: z.enum(['level', 'rir', 'rpe']),
  timezone: z.string(),
  timezoneChangedAt: z.string().nullable(),
});

export const profileCache = userCache<Profile>('gainscape.profile.v1.', profileSchema);
