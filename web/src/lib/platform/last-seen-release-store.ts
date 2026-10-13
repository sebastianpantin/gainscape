import type { LastSeenRelease } from './changelog-rules.ts';

export const LAST_SEEN_RELEASE_KEY_PREFIX = 'gainscape.whats-new.last-seen.';

export function lastSeenReleaseKey(userId: string): string {
  return `${LAST_SEEN_RELEASE_KEY_PREFIX}${userId}`;
}

export function readLastSeenRelease(storage: Storage | null, userId: string): LastSeenRelease {
  if (!storage) return { status: 'unavailable' };
  const key = lastSeenReleaseKey(userId);
  try {
    const version = storage.getItem(key);
    if (version === null) return { status: 'absent' };
    storage.setItem(key, version);
    return { status: 'seen', version };
  } catch {
    return { status: 'unavailable' };
  }
}

export function saveLastSeenRelease(storage: Storage | null, userId: string, version: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(lastSeenReleaseKey(userId), version);
    return true;
  } catch {
    return false;
  }
}

export function forgetLastSeenRelease(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(lastSeenReleaseKey(userId));
  } catch {
    return;
  }
}
