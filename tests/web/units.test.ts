import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../../supabase/functions/_shared/domain/balance.ts';
import {
  cmToFeetAndInches,
  parsedDecimal,
  typedNumberWithin,
  wholeNumberWithin,
  type DistanceUnit,
  distanceInUnit,
  distanceUnitFor,
  feetAndInchesToCm,
  formatDistance,
  formatHeight,
  formatPace,
  formatWeight,
  KG_PER_LB,
  shownDistance,
  shownWeight,
  steppedReps,
  steppedWeight,
  unitToDistanceM,
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
    expect(STORAGE_TOLERANCE_KG).toBeLessThan(DEFAULT_BALANCE.prMinGainKg);
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
        expect(Math.abs(reentered - storedKg)).toBeLessThan(DEFAULT_BALANCE.prMinGainKg);
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

const DISTANCE_UNITS: DistanceUnit[] = ['km', 'mi', 'm', 'yd'];
const DISTANCE_RECORD_MIN_GAIN_M = 100;

describe('distance units', () => {
  it('follows the weight preference, in metres or yards for pool activities', () => {
    expect(distanceUnitFor('kg', 'per_km')).toBe('km');
    expect(distanceUnitFor('lb', 'per_km')).toBe('mi');
    expect(distanceUnitFor('kg', 'per_100m')).toBe('m');
    expect(distanceUnitFor('lb', 'per_100m')).toBe('yd');
  });

  it('converts each unit to metres', () => {
    expect(unitToDistanceM(5, 'km')).toBe(5000);
    expect(unitToDistanceM(1, 'mi')).toBe(1609.3);
    expect(unitToDistanceM(400, 'm')).toBe(400);
    expect(unitToDistanceM(100, 'yd')).toBe(91.4);
  });

  it.each(DISTANCE_UNITS)('round-trips any stored distance at 0.1 m through %s', (unit) => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 2_000_000 }), (decimetres) => {
        const distanceM = decimetres / 10;
        expect(unitToDistanceM(distanceInUnit(distanceM, unit), unit)).toBe(distanceM);
      }),
    );
  });

  it.each(DISTANCE_UNITS)('never moves a re-entered %s distance by the record threshold', (unit) => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 2_000_000 }), (decimetres) => {
        const distanceM = decimetres / 10;
        const reentered = unitToDistanceM(shownDistance(distanceM, unit), unit);
        expect(Math.abs(reentered - distanceM)).toBeLessThan(DISTANCE_RECORD_MIN_GAIN_M);
      }),
    );
  });

  it('turns the same typed miles into the same metres every time', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12_000 }), (hundredthsOfMile) => {
        const miles = hundredthsOfMile / 100;
        const first = unitToDistanceM(miles, 'mi');
        expect(unitToDistanceM(shownDistance(first, 'mi'), 'mi')).toBe(first);
      }),
    );
  });

  it('formats distances in the chosen unit', () => {
    expect(formatDistance(5000, 'km')).toBe('5 km');
    expect(formatDistance(5000, 'mi')).toBe('3.11 mi');
    expect(formatDistance(400, 'm')).toBe('400 m');
    expect(formatDistance(400, 'yd')).toBe('437 yd');
  });
});

describe('pace', () => {
  it('formats pace per kilometre and per mile', () => {
    expect(formatPace(1800, 5000, 'km')).toBe('6:00 /km');
    expect(formatPace(1800, 5000, 'mi')).toBe('9:39 /mi');
  });

  it('formats pool pace per 100 m and per 100 yd', () => {
    expect(formatPace(600, 400, 'm')).toBe('2:30 /100 m');
    expect(formatPace(600, 400, 'yd')).toBe('2:17 /100 yd');
  });

  it('carries rounded seconds into the next minute', () => {
    expect(formatPace(359.8, 1000, 'km')).toBe('6:00 /km');
  });
});

describe('weight and reps steppers', () => {
  it('steps kilograms by 2.5 and pounds by 5', () => {
    expect(steppedWeight(60, 'kg', 1, 2000)).toBe(62.5);
    expect(steppedWeight(60, 'kg', -1, 2000)).toBe(57.5);
    expect(steppedWeight(135, 'lb', 1, 4409)).toBe(140);
    expect(steppedWeight(135, 'lb', -1, 4409)).toBe(130);
  });

  it('snaps an off-step weight to the next step in the chosen direction', () => {
    expect(steppedWeight(61, 'kg', 1, 2000)).toBe(62.5);
    expect(steppedWeight(61, 'kg', -1, 2000)).toBe(60);
    expect(steppedWeight(132.3, 'lb', 1, 4409)).toBe(135);
    expect(steppedWeight(132.3, 'lb', -1, 4409)).toBe(130);
  });

  it('keeps the weight between zero and the highest load', () => {
    expect(steppedWeight(1, 'kg', -1, 2000)).toBe(0);
    expect(steppedWeight(0, 'kg', -1, 2000)).toBe(0);
    expect(steppedWeight(1999, 'kg', 1, 2000)).toBe(2000);
  });

  it('steps reps by one between 1 and 100', () => {
    expect(steppedReps(5, 1)).toBe(6);
    expect(steppedReps(5, -1)).toBe(4);
    expect(steppedReps(1, -1)).toBe(1);
    expect(steppedReps(100, 1)).toBe(100);
  });
});

describe('wholeNumberWithin', () => {
  it('reads a whole number inside the bounds', () => {
    expect(wholeNumberWithin('3', 1, 20)).toBe(3);
    expect(wholeNumberWithin(' 20 ', 1, 20)).toBe(20);
  });

  it('refuses blanks, fractions and numbers outside the bounds', () => {
    expect(wholeNumberWithin('', 1, 20)).toBeNull();
    expect(wholeNumberWithin('2.5', 1, 20)).toBeNull();
    expect(wholeNumberWithin('0', 1, 20)).toBeNull();
    expect(wholeNumberWithin('21', 1, 20)).toBeNull();
  });
});

describe('parsedDecimal', () => {
  it('reads a dot or a comma as the decimal separator', () => {
    expect(parsedDecimal('62.5')).toBe(62.5);
    expect(parsedDecimal('62,5')).toBe(62.5);
    expect(parsedDecimal(' 80 ')).toBe(80);
    expect(parsedDecimal('62.')).toBe(62);
  });

  it('is null for a blank or unreadable text', () => {
    for (const raw of ['', '  ', '-', 'abc', '6,2,5']) expect(parsedDecimal(raw)).toBeNull();
  });
});

describe('typedNumberWithin', () => {
  it('reads a typed number and clamps it into the bounds', () => {
    expect(typedNumberWithin('62,5', 0, 2000, false)).toBe(62.5);
    expect(typedNumberWithin('2500', 0, 2000, false)).toBe(2000);
    expect(typedNumberWithin('0', 1, 100, true)).toBe(1);
  });

  it('rounds a whole-number field', () => {
    expect(typedNumberWithin('8.4', 1, 100, true)).toBe(8);
    expect(typedNumberWithin('8,6', 1, 100, true)).toBe(9);
  });

  it('is null while the field is blank or unreadable', () => {
    expect(typedNumberWithin('', 0, 2000, false)).toBeNull();
    expect(typedNumberWithin('x', 1, 100, true)).toBeNull();
  });
});
