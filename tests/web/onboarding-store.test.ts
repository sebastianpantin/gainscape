import { describe, expect, it } from 'vitest';
import {
  forgetOnboarding,
  onboardingKey,
  readOnboarding,
  saveOnboardingDone,
} from '../../web/src/lib/profile/onboarding-store.ts';
import { MemoryStorage, throwingStorage } from './memory-storage.ts';

describe('stored onboarding', () => {
  it('round-trips per user', () => {
    const storage = new MemoryStorage();
    expect(readOnboarding(storage, 'user-1')).toEqual({ status: 'absent' });
    expect(saveOnboardingDone(storage, 'user-1')).toBe(true);
    expect(storage.getItem(onboardingKey('user-1'))).toBe('done');
    expect(readOnboarding(storage, 'user-1')).toEqual({ status: 'done' });
    expect(readOnboarding(storage, 'user-2')).toEqual({ status: 'absent' });
  });

  it('is unavailable without storage or when storage throws', () => {
    const throwing = throwingStorage('getItem', 'setItem');
    expect(readOnboarding(null, 'user-1')).toEqual({ status: 'unavailable' });
    expect(readOnboarding(throwing, 'user-1')).toEqual({ status: 'unavailable' });
    expect(saveOnboardingDone(null, 'user-1')).toBe(false);
    expect(saveOnboardingDone(throwing, 'user-1')).toBe(false);
  });

  it('is unavailable when nothing is stored and storage cannot be written', () => {
    const readOnly = throwingStorage('setItem');
    expect(readOnboarding(readOnly, 'user-1')).toEqual({ status: 'unavailable' });
  });

  it('forgets one user and keeps the other', () => {
    const storage = new MemoryStorage();
    saveOnboardingDone(storage, 'user-1');
    saveOnboardingDone(storage, 'user-2');
    forgetOnboarding(storage, 'user-1');
    expect(readOnboarding(storage, 'user-1')).toEqual({ status: 'absent' });
    expect(readOnboarding(storage, 'user-2')).toEqual({ status: 'done' });
  });
});
