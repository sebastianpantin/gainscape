import { describe, expect, it } from 'vitest';
import { slotClass } from '../../web/src/features/collection/slot-class.ts';

describe('slotClass', () => {
  it('marks an empty slot, an exact rep max and one beaten by a higher-rep set', () => {
    expect(slotClass(null)).toBe('record-slot empty');
    expect(slotClass({ exact: true })).toBe('record-slot filled');
    expect(slotClass({ exact: false })).toBe('record-slot');
  });
});
