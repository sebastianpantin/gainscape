import { describe, expect, it } from 'vitest';
import { measuresRepsCapacity, paceSPerKm, roundTo, roundXp } from '@domain/index.ts';

describe('roundTo', () => {
  it('rounds to the given decimals', () => {
    expect(roundTo(2, 62.505)).toBe(62.51);
    expect(roundTo(1, 299.96)).toBe(300);
    expect(roundTo(5, 0.1 + 0.2)).toBe(0.3);
  });
});

describe('roundXp', () => {
  it('rounds to whole XP after removing float noise', () => {
    expect(roundXp(54.5)).toBe(55);
    expect(roundXp(54.49999999)).toBe(55);
    expect(roundXp(54.4999)).toBe(54);
  });
});

describe('paceSPerKm', () => {
  it('converts a duration over a distance into seconds per kilometre', () => {
    expect(paceSPerKm(1800, 5000)).toBe(360);
  });
});

describe('measuresRepsCapacity', () => {
  it('is true only for pure bodyweight exercises', () => {
    expect(measuresRepsCapacity('bodyweight')).toBe(true);
    expect(measuresRepsCapacity('bodyweight_plus')).toBe(false);
    expect(measuresRepsCapacity('external')).toBe(false);
  });
});
