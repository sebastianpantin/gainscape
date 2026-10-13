import { type OnboardingRecord } from './onboarding-rules.ts';

export const ONBOARDING_KEY_PREFIX = 'gainscape.onboarding.';
const DONE = 'done';

export function onboardingKey(userId: string): string {
  return `${ONBOARDING_KEY_PREFIX}${userId}`;
}

export function readOnboarding(storage: Storage | null, userId: string): OnboardingRecord {
  if (!storage) return { status: 'unavailable' };
  const key = onboardingKey(userId);
  try {
    if (storage.getItem(key) === DONE) return { status: 'done' };
    storage.setItem(key, '');
    storage.removeItem(key);
    return { status: 'absent' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function saveOnboardingDone(storage: Storage | null, userId: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(onboardingKey(userId), DONE);
    return true;
  } catch {
    return false;
  }
}

export function forgetOnboarding(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(onboardingKey(userId));
  } catch {
    return;
  }
}
