import { describe, expect, it } from 'vitest';
import { type Profile } from '../../web/src/lib/profile-rules.ts';
import { profileCache } from '../../web/src/offline/profile-cache.ts';
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
});
