import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingLocalPreferences, preferencesCache } from '../../web/src/lib/profile/preferences.ts';
import { MemoryStorage } from './memory-storage.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const key = `gainscape.preferences.${userId}`;

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cached preferences', () => {
  it('round-trips the preferences of one user', () => {
    preferencesCache.save(storage, userId, { unitPref: 'lb', effortInputMode: 'rpe' });
    expect(preferencesCache.read(storage, userId)).toEqual({ unitPref: 'lb', effortInputMode: 'rpe' });
    expect(preferencesCache.read(storage, '22222222-2222-4222-8222-222222222222')).toBeNull();
  });

  it('accepts every unit and effort mode', () => {
    for (const unitPref of ['kg', 'lb'])
      for (const effortInputMode of ['level', 'rir', 'rpe']) {
        storage.setItem(key, JSON.stringify({ unitPref, effortInputMode }));
        expect(preferencesCache.read(storage, userId)).toEqual({ unitPref, effortInputMode });
      }
  });

  it('rejects anything that is not a preferences record', () => {
    for (const raw of ['null', '"kg"', '{"unitPref":"st","effortInputMode":"level"}', '{"unitPref":"kg"}', '{bad']) {
      storage.setItem(key, raw);
      expect(preferencesCache.read(storage, userId)).toBeNull();
    }
  });

  it('degrades silently when local storage throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => preferencesCache.save(blocked, userId, { unitPref: 'kg', effortInputMode: 'level' })).not.toThrow();
    expect(preferencesCache.read(blocked, userId)).toBeNull();
  });
});

describe('pendingLocalPreferences', () => {
  const kg = { unitPref: 'kg', effortInputMode: 'level' } as const;
  const lb = { unitPref: 'lb', effortInputMode: 'level' } as const;

  it('keeps a local change while the loaded profile still says otherwise, so an older answer cannot undo it', () => {
    expect(pendingLocalPreferences(lb, kg)).toBe(lb);
    expect(pendingLocalPreferences(lb, undefined)).toBe(lb);
  });

  it('lets go of the local change once the loaded profile agrees with it', () => {
    expect(pendingLocalPreferences(lb, { ...lb })).toBeNull();
  });

  it('has nothing pending without a local change', () => {
    expect(pendingLocalPreferences(null, kg)).toBeNull();
  });
});
