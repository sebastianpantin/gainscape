import { describe, expect, it } from 'vitest';
import {
  isWholeNumberBetween,
  measuresRepsCapacity,
  nonNegativeIntegerPercent,
  paceSPerKm,
  roundTo,
  roundXp,
} from '@domain/index.ts';

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

describe('isWholeNumberBetween', () => {
  it('accepts whole numbers inside the inclusive bounds', () => {
    expect(isWholeNumberBetween(1, 1, 5)).toBe(true);
    expect(isWholeNumberBetween(5, 1, 5)).toBe(true);
  });

  it('rejects fractions, values outside the bounds and non-numbers', () => {
    expect(isWholeNumberBetween(2.5, 1, 5)).toBe(false);
    expect(isWholeNumberBetween(0, 1, 5)).toBe(false);
    expect(isWholeNumberBetween(6, 1, 5)).toBe(false);
    expect(isWholeNumberBetween('3', 1, 5)).toBe(false);
  });
});

describe('nonNegativeIntegerPercent', () => {
  it('returns a non-negative whole percent unchanged', () => {
    expect(nonNegativeIntegerPercent('challengeBonusPercent', 0)).toBe(0);
    expect(nonNegativeIntegerPercent('challengeBonusPercent', 25)).toBe(25);
  });

  it('names the field when the percent is negative or fractional', () => {
    expect(() => nonNegativeIntegerPercent('gearBonusPercentAtFullTier', -1)).toThrow(
      new RangeError('gearBonusPercentAtFullTier must be a non-negative integer, got -1'),
    );
    expect(() => nonNegativeIntegerPercent('challengeBonusPercent', 2.5)).toThrow(
      new RangeError('challengeBonusPercent must be a non-negative integer, got 2.5'),
    );
  });
});
