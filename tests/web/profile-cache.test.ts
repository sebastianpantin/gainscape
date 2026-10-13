import { describe, expect, it } from 'vitest';
import {
  BADGE_COLOR_KEYS,
  EFFORT_INPUT_MODES,
  type Profile,
  TRAINING_FOCUSES,
  UNIT_PREFS,
} from '../../web/src/lib/profile/profile-rules.ts';
import { profileCache, rememberSavedBodyweight } from '../../web/src/offline/profile-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const PROFILE: Profile = {
  username: 'lifter',
  displayName: 'Lifter',
  bio: null,
  trainingFocus: 'strength',
  trainingSince: 2019,
  badgeColor: 'gold',
  showWeights: true,
  showBodyweight: false,
  createdAt: '2026-10-01T08:00:00.000Z',
  bodyweightKg: 82.5,
  heightCm: null,
  birthYear: 1990,
  unitPref: 'kg',
  effortInputMode: 'rir',
  timezone: 'Europe/Stockholm',
  timezoneChangedAt: null,
};

describe('saved profile', () => {
  it('reads back the saved profile for the same user', () => {
    const storage = new MemoryStorage();
    profileCache.save(storage, USER_ID, PROFILE);
    expect(profileCache.read(storage, USER_ID)).toEqual(PROFILE);
  });

  it('ignores a saved profile with an unknown unit', () => {
    const storage = new MemoryStorage();
    profileCache.save(storage, USER_ID, { ...PROFILE, unitPref: 'stone' as 'kg' });
    expect(profileCache.read(storage, USER_ID)).toBeNull();
  });

  it('accepts every unit, effort mode, training focus and badge colour the app knows', () => {
    const storage = new MemoryStorage();
    const variants: Profile[] = [
      ...UNIT_PREFS.map((unitPref) => ({ ...PROFILE, unitPref })),
      ...EFFORT_INPUT_MODES.map((effortInputMode) => ({ ...PROFILE, effortInputMode })),
      ...TRAINING_FOCUSES.map((trainingFocus) => ({ ...PROFILE, trainingFocus })),
      ...BADGE_COLOR_KEYS.map((badgeColor) => ({ ...PROFILE, badgeColor })),
    ];
    for (const variant of variants) {
      profileCache.save(storage, USER_ID, variant);
      expect(profileCache.read(storage, USER_ID)).toEqual(variant);
    }
  });

  it('patches the bodyweight of the saved profile after it was saved online', () => {
    const storage = new MemoryStorage();
    profileCache.save(storage, USER_ID, PROFILE);
    rememberSavedBodyweight(storage, USER_ID, 90);
    expect(profileCache.read(storage, USER_ID)).toEqual({ ...PROFILE, bodyweightKg: 90 });
  });

  it('saves nothing when no profile was saved', () => {
    const storage = new MemoryStorage();
    rememberSavedBodyweight(storage, USER_ID, 90);
    expect(profileCache.read(storage, USER_ID)).toBeNull();
  });
});
