import { describe, expect, it } from 'vitest';
import { slotClass, slotLabel, slotsByReps, slotText } from '../../web/src/features/collection/record-slots.ts';

describe('slotClass', () => {
  it('marks an empty slot, an exact rep max and one beaten by a higher-rep set', () => {
    expect(slotClass(null)).toBe('record-slot empty');
    expect(slotClass({ exact: true })).toBe('record-slot filled');
    expect(slotClass({ exact: false })).toBe('record-slot');
  });
});

describe('slotText', () => {
  it('shows a dash for an empty slot and the load of a filled one', () => {
    expect(slotText(null, 'external', 'kg')).toBe('—');
    expect(slotText({ loadKg: 100 }, 'external', 'kg')).toBe('100 kg');
    expect(slotText({ loadKg: 20 }, 'bodyweight_plus', 'lb')).toBe('+44.1 lb');
  });

  it('shows only that a slot is set when the weights are hidden or unknown', () => {
    expect(slotText({ loadKg: 100 }, 'external', 'kg', true)).toBe('Set');
    expect(slotText({ loadKg: null }, 'external', 'kg')).toBe('Set');
    expect(slotText(null, 'external', 'kg', true)).toBe('—');
  });
});

describe('slotLabel', () => {
  it('names a slot by its reps and load, and says when it is empty or came from a higher-rep set', () => {
    expect(slotLabel(5, { loadKg: 70, exact: true }, 'external', 'kg')).toBe('5RM 70 kg');
    expect(slotLabel(4, { loadKg: 70, exact: false }, 'external', 'kg')).toBe('4RM 70 kg, beaten by a higher-rep set');
    expect(slotLabel(6, null, 'external', 'kg')).toBe('6RM empty');
    expect(slotLabel(1, { loadKg: 100, exact: true }, 'external', 'kg', true)).toBe('1RM Set');
  });
});

describe('slotsByReps', () => {
  it('places each rep max in the slot of its reps and leaves the rest empty', () => {
    const three = { reps: 3, loadKg: 90, exact: true };
    const one = { reps: 1, loadKg: 100, exact: false };
    const slots = slotsByReps([three, one]);
    expect(slots).toHaveLength(10);
    expect(slots[0]).toBe(one);
    expect(slots[1]).toBeNull();
    expect(slots[2]).toBe(three);
    expect(slots.slice(3).every((slot) => slot === null)).toBe(true);
  });
});
