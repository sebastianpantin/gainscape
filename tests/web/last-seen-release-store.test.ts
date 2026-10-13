import { describe, expect, it } from 'vitest';
import {
  lastSeenReleaseKey,
  readLastSeenRelease,
  saveLastSeenRelease,
} from '../../web/src/lib/platform/last-seen-release-store.ts';
import { MemoryStorage } from './memory-storage.ts';

function blocked(): never {
  throw new Error('blocked');
}

describe('stored last seen release', () => {
  it('round-trips per user', () => {
    const storage = new MemoryStorage();
    expect(saveLastSeenRelease(storage, 'user-1', '1.2.0')).toBe(true);
    expect(storage.getItem(lastSeenReleaseKey('user-1'))).toBe('1.2.0');
    expect(readLastSeenRelease(storage, 'user-1')).toEqual({ status: 'seen', version: '1.2.0' });
    expect(readLastSeenRelease(storage, 'user-2')).toEqual({ status: 'absent' });
  });

  it('is unavailable without storage or when reading throws', () => {
    const throwing = new MemoryStorage();
    throwing.getItem = blocked;
    expect(readLastSeenRelease(null, 'user-1')).toEqual({ status: 'unavailable' });
    expect(readLastSeenRelease(throwing, 'user-1')).toEqual({ status: 'unavailable' });
    expect(saveLastSeenRelease(null, 'user-1', '1.2.0')).toBe(false);
  });

  it('is unavailable when a stored value cannot be written back', () => {
    const readOnly = new MemoryStorage();
    readOnly.setItem(lastSeenReleaseKey('user-1'), '1.0.0');
    readOnly.setItem = blocked;
    expect(readLastSeenRelease(readOnly, 'user-1')).toEqual({ status: 'unavailable' });
    expect(saveLastSeenRelease(readOnly, 'user-1', '1.2.0')).toBe(false);
  });

  it('is absent when nothing is stored, even if writes throw', () => {
    const readOnly = new MemoryStorage();
    readOnly.setItem = blocked;
    expect(readLastSeenRelease(readOnly, 'user-1')).toEqual({ status: 'absent' });
  });
});
