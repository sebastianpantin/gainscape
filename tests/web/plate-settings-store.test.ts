import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATE_SETTINGS } from '../../web/src/lib/workout/plate-rules.ts';
import { readPlateSettings, savePlateSettings } from '../../web/src/lib/workout/plate-settings-store.ts';
import { MemoryStorage, throwingStorage } from './memory-storage.ts';

describe('stored plate settings', () => {
  it('round-trips through storage per user', () => {
    const storage = new MemoryStorage();
    const changed = { ...DEFAULT_PLATE_SETTINGS, kg: { barWeight: 15, plates: [20, 10] } };
    savePlateSettings(storage, 'user-1', changed);
    expect(readPlateSettings(storage, 'user-1')).toEqual(changed);
    expect(readPlateSettings(storage, 'user-2')).toEqual(DEFAULT_PLATE_SETTINGS);
  });

  it('falls back to the defaults without storage or when storage throws', () => {
    const throwing = throwingStorage('getItem', 'setItem');
    expect(readPlateSettings(null, 'user-1')).toEqual(DEFAULT_PLATE_SETTINGS);
    expect(readPlateSettings(throwing, 'user-1')).toEqual(DEFAULT_PLATE_SETTINGS);
    expect(() => savePlateSettings(throwing, 'user-1', DEFAULT_PLATE_SETTINGS)).not.toThrow();
  });
});
