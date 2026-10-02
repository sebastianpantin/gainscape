import { describe, expect, it } from 'vitest';
import { amountInUnit, KG_PER_LB, kgToUnit, unitToKg } from '@domain/index.ts';
import { shownWeight } from '../../web/src/lib/units.ts';

describe('KG_PER_LB', () => {
  it('is the international avoirdupois pound in kilograms', () => {
    expect(KG_PER_LB).toBe(0.45359237);
  });
});

describe('unitToKg', () => {
  it('keeps a kg value unchanged', () => {
    expect(unitToKg(142.5, 'kg')).toBe(142.5);
  });

  it('rounds a kg value to 2 decimals: 92.625 → 92.63', () => {
    expect(unitToKg(92.625, 'kg')).toBe(92.63);
  });

  it.each([
    [195, 88.45, '195 × 0.45359237 = 88.4505'],
    [225, 102.06, '225 × 0.45359237 = 102.0583'],
    [255, 115.67, '255 × 0.45359237 = 115.6661'],
    [45, 20.41, '45 × 0.45359237 = 20.4117'],
    [205, 92.99, '205 × 0.45359237 = 92.9864'],
  ])('converts %s lb to %s kg (%s)', (lb, kg) => {
    expect(unitToKg(lb, 'lb')).toBe(kg);
  });
});

describe('kgToUnit', () => {
  it('keeps a kg value unchanged', () => {
    expect(kgToUnit(100, 'kg')).toBe(100);
  });

  it('converts 45.359237 kg to 100 lb', () => {
    expect(kgToUnit(45.359237, 'lb')).toBeCloseTo(100, 9);
  });

  it('converts 88.45 kg to 194.9989 lb without rounding (88.45 / 0.45359237)', () => {
    expect(kgToUnit(88.45, 'lb')).toBeCloseTo(194.9989, 4);
  });
});

describe('amountInUnit', () => {
  it('picks the kg amount for a kg enrollment', () => {
    expect(amountInUnit({ kg: 2.5, lb: 5 }, 'kg')).toBe(2.5);
  });

  it('picks the lb amount for an lb enrollment', () => {
    expect(amountInUnit({ kg: 2.5, lb: 5 }, 'lb')).toBe(5);
  });
});

describe('kg storage round trip through shownWeight', () => {
  it.each([195, 225, 255, 100, 125, 150, 175, 200, 205, 300, 310])(
    '%s lb stored as kg shows as the same lb value',
    (lb) => {
      expect(shownWeight(unitToKg(lb, 'lb'), 'lb')).toBe(lb);
    },
  );

  it.each([92.5, 107.5, 120, 61.25])('%s kg stored as kg shows unchanged', (kg) => {
    expect(shownWeight(unitToKg(kg, 'kg'), 'kg')).toBe(kg);
  });
});
