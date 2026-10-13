import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline } from '../offline/cache-first.ts';
import { profileCache } from '../offline/profile-cache.ts';
import { withFriendlyRateLimit } from './rate-limit.ts';
import { deviceStorage } from './keyed-store.ts';
import { supabase } from './supabase.ts';
import type { Profile } from './profile-rules.ts';

export * from './profile-rules.ts';

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const [publicPart, privatePart] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'username, display_name, bio, training_focus, training_since, badge_color, show_weights, show_bodyweight, created_at',
      )
      .eq('id', userId)
      .single(),
    supabase
      .from('profile_private')
      .select('bodyweight_kg, height_cm, birth_year, unit_pref, effort_input_mode, timezone, timezone_changed_at')
      .eq('user_id', userId)
      .single(),
  ]);
  if (publicPart.error) throw publicPart.error;
  if (privatePart.error) throw privatePart.error;
  const profile: Profile = {
    username: publicPart.data.username,
    displayName: publicPart.data.display_name,
    bio: publicPart.data.bio,
    trainingFocus: publicPart.data.training_focus,
    trainingSince: publicPart.data.training_since,
    badgeColor: publicPart.data.badge_color,
    showWeights: publicPart.data.show_weights,
    showBodyweight: publicPart.data.show_bodyweight,
    createdAt: publicPart.data.created_at,
    bodyweightKg: numberOrNull(privatePart.data.bodyweight_kg),
    heightCm: numberOrNull(privatePart.data.height_cm),
    birthYear: privatePart.data.birth_year,
    unitPref: privatePart.data.unit_pref,
    effortInputMode: privatePart.data.effort_input_mode,
    timezone: privatePart.data.timezone,
    timezoneChangedAt: privatePart.data.timezone_changed_at,
  };
  return profile;
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

export type PublicProfileChanges = Partial<
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

export type PrivateProfileChanges = Partial<
  Pick<Profile, 'bodyweightKg' | 'heightCm' | 'birthYear' | 'unitPref' | 'effortInputMode'>
>;

const PRIVATE_COLUMNS: Record<keyof PrivateProfileChanges, string> = {
  bodyweightKg: 'bodyweight_kg',
  heightCm: 'height_cm',
  birthYear: 'birth_year',
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

export type TimezoneChangeResult =
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
