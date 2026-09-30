import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../../supabase/functions/_shared/domain/balance.ts';
import {
  cmToFeetAndInches,
  feetAndInchesToCm,
  formatHeight,
  formatWeight,
  KG_PER_LB,
  shownWeight,
  unitToKg,
} from '../../web/src/lib/units.ts';

const STORAGE_TOLERANCE_KG = 0.005;

describe('weight units', () => {
  it('keeps kilograms as they are', () => {
    expect(unitToKg(82.4, 'kg')).toBe(82.4);
    expect(formatWeight(107.5, 'kg')).toBe('107.5 kg');
    expect(formatWeight(70, 'kg')).toBe('70 kg');
  });

  it('converts pounds to kilograms rounded to 2 decimals', () => {
    expect(unitToKg(135, 'lb')).toBe(61.23);
    expect(formatWeight(61.23, 'lb')).toBe('135 lb');
    expect(KG_PER_LB).toBe(0.45359237);
  });

  it('round-trips any half-pound input through storage and back to the same pound value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), (halfPounds) => {
        const pounds = halfPounds / 2;
        expect(shownWeight(unitToKg(pounds, 'lb'), 'lb')).toBe(pounds);
      }),
    );
  });

  it('stores within 0.005 kg of the exact value, far below the record threshold', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 2000, noNaN: true }), (pounds) => {
        const stored = unitToKg(pounds, 'lb');
        expect(Math.abs(stored - pounds * KG_PER_LB)).toBeLessThanOrEqual(STORAGE_TOLERANCE_KG + 1e-9);
      }),
    );
    expect(STORAGE_TOLERANCE_KG).toBeLessThan(DEFAULT_BALANCE.prEpsilonKg);
  });

  it('turns the same typed pounds into the same kilograms every time, so repeats never look like a record', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), (halfPounds) => {
        const pounds = halfPounds / 2;
        const first = unitToKg(pounds, 'lb');
        const again = unitToKg(shownWeight(first, 'lb'), 'lb');
        expect(again).toBe(first);
      }),
    );
  });
});

describe('switching an existing kg history to pounds', () => {
  it('never moves a stored 2-decimal kg value by the record threshold when the shown pounds are re-entered', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200_000 }), (hundredthsOfKg) => {
        const storedKg = hundredthsOfKg / 100;
        const reentered = unitToKg(shownWeight(storedKg, 'lb'), 'lb');
        expect(Math.abs(reentered - storedKg)).toBeLessThan(DEFAULT_BALANCE.prEpsilonKg);
      }),
    );
  });
});

describe('height units', () => {
  it('converts centimetres to feet and inches', () => {
    expect(cmToFeetAndInches(181)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFeetAndInches(152.4)).toEqual({ feet: 5, inches: 0 });
  });

  it('converts feet and inches to centimetres', () => {
    expect(feetAndInchesToCm({ feet: 5, inches: 11 })).toBe(180.3);
  });

  it('formats height for each unit preference', () => {
    expect(formatHeight(181, 'kg')).toBe('181 cm');
    expect(formatHeight(181, 'lb')).toBe('5 ft 11 in');
  });
});
