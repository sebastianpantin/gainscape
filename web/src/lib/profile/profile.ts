import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { profileCache } from '../../offline/profile-cache.ts';
import { withFriendlyRateLimit } from '../platform/rate-limit.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import { parsedRow } from '../rows.ts';
import {
  PROFILE_COLUMNS,
  PROFILE_PRIVATE_COLUMNS,
  type Profile,
  profileFromRows,
  profilePrivateRowSchema,
  profileRowSchema,
} from './profile-rules.ts';

export * from './profile-rules.ts';

export async function fetchProfile(userId: string): Promise<Profile> {
  const [publicPart, privatePart] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single(),
    supabase.from('profile_private').select(PROFILE_PRIVATE_COLUMNS).eq('user_id', userId).single(),
  ]);
  if (publicPart.error) throw publicPart.error;
  if (privatePart.error) throw privatePart.error;
  return profileFromRows(
    parsedRow(profileRowSchema, publicPart.data),
    parsedRow(profilePrivateRowSchema, privatePart.data),
  );
}

export function loadProfileCacheFirst(userId: string, signal?: AbortSignal): Promise<CacheFirstLoad<Profile>> {
  return loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => profileCache.read(deviceStorage(), userId),
    async () => {
      const profile = await fetchProfile(userId);
      if (!signal?.aborted) profileCache.save(deviceStorage(), userId, profile);
      return profile;
    },
  );
}

type PublicProfileChanges = Partial<
  Pick<
    Profile,
    'displayName' | 'bio' | 'trainingFocus' | 'trainingSince' | 'badgeColor' | 'showWeights' | 'showBodyweight'
  >
>;

const PUBLIC_COLUMNS: Record<keyof PublicProfileChanges, string> = {
  displayName: 'display_name',
  bio: 'bio',
  trainingFocus: 'training_focus',
  trainingSince: 'training_since',
  badgeColor: 'badge_color',
  showWeights: 'show_weights',
  showBodyweight: 'show_bodyweight',
};

type PrivateProfileChanges = Partial<
  Pick<Profile, 'bodyweightKg' | 'heightCm' | 'birthYear' | 'sex' | 'unitPref' | 'effortInputMode'>
>;

const PRIVATE_COLUMNS: Record<keyof PrivateProfileChanges, string> = {
  bodyweightKg: 'bodyweight_kg',
  heightCm: 'height_cm',
  birthYear: 'birth_year',
  sex: 'sex',
  unitPref: 'unit_pref',
  effortInputMode: 'effort_input_mode',
};

function toRow<K extends string>(changes: Partial<Record<K, unknown>>, columns: Record<K, string>) {
  return Object.fromEntries(
    (Object.keys(changes) as K[])
      .filter((key) => changes[key] !== undefined)
      .map((key) => [columns[key], changes[key]]),
  );
}

export async function updatePublicProfile(userId: string, changes: PublicProfileChanges): Promise<void> {
  const row = toRow(changes, PUBLIC_COLUMNS);
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('profiles').update(row).eq('id', userId);
  if (error) throw withFriendlyRateLimit(error);
}

export async function updatePrivateProfile(userId: string, changes: PrivateProfileChanges): Promise<void> {
  const row = toRow(changes, PRIVATE_COLUMNS);
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('profile_private').update(row).eq('user_id', userId);
  if (error) throw withFriendlyRateLimit(error);
}

type TimezoneChangeResult =
  | { ok: true }
  | { ok: false; reason: 'too_soon'; nextAllowedAt: string }
  | { ok: false; reason: 'invalid' | 'failed'; message: string };

export async function changeTimezone(candidate: string): Promise<TimezoneChangeResult> {
  const { error } = await supabase.rpc('set_timezone', { candidate });
  if (!error) return { ok: true };
  if (error.message === 'timezone_change_too_soon')
    return { ok: false, reason: 'too_soon', nextAllowedAt: error.details };
  if (error.message === 'invalid_timezone')
    return { ok: false, reason: 'invalid', message: 'That time zone is not recognised.' };
  return { ok: false, reason: 'failed', message: error.message };
}
