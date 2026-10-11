import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUNDING, roundLoad } from '@domain/index.ts';
import { halfIncrementKg, roundPrescribedLoad } from '@domain/load-rounding.ts';

describe('roundLoad nearest (spreadsheet MROUND, ties up)', () => {
  it.each([
    [106.875, 107.5, '142.5 × 0.75 = 106.875; 106.875 / 2.5 = 42.75 → 43 → 107.5'],
    [121.125, 120, '142.5 × 0.85 = 121.125; 121.125 / 2.5 = 48.45 → 48 → 120'],
    [135.375, 135, '142.5 × 0.95 = 135.375; 135.375 / 2.5 = 54.15 → 54 → 135'],
    [92.625, 92.5, '142.5 × 0.65 = 92.625; 92.625 / 2.5 = 37.05 → 37 → 92.5'],
  ])('rounds %s to %s at 2.5 kg (%s)', (value, expected) => {
    expect(roundLoad(value, 2.5, 'nearest')).toBe(expected);
  });

  it('rounds the tie 101.25 up to 102.5 (101.25 / 2.5 = 40.5 → 41)', () => {
    expect(roundLoad(101.25, 2.5, 'nearest')).toBe(102.5);
  });

  it('rounds the tie 71.25 up to 72.5 (142.5 × 0.5 = 71.25; / 2.5 = 28.5 → 29)', () => {
    expect(roundLoad(71.25, 2.5, 'nearest')).toBe(72.5);
  });

  it('rounds 87.5 × 0.70 up to 62.5 although the raw float is 61.2499… (epsilon)', () => {
    const rawEpsilonCase = 87.5 * 0.7;
    expect(rawEpsilonCase).toBeLessThan(61.25);
    expect(roundLoad(rawEpsilonCase, 2.5, 'nearest')).toBe(62.5);
  });

  it('rounds 65.25 down to 65 (145 × 0.45 = 65.25; / 2.5 = 26.1 → 26)', () => {
    expect(roundLoad(65.25, 2.5, 'nearest')).toBe(65);
  });

  it('keeps an exact multiple unchanged: 100 → 100', () => {
    expect(roundLoad(100, 2.5, 'nearest')).toBe(100);
  });
});

describe('roundLoad down', () => {
  it('rounds 101.25 down to 100 (101.25 / 2.5 = 40.5 → 40)', () => {
    expect(roundLoad(101.25, 2.5, 'down')).toBe(100);
  });

  it('rounds 99.75 down to 97.5 (142.5 × 0.70 = 99.75; / 2.5 = 39.9 → 39)', () => {
    expect(roundLoad(99.75, 2.5, 'down')).toBe(97.5);
  });

  it('keeps 87.5 × 0.70 at 61.25 with a 1.25 increment although the raw float is 61.2499… (epsilon)', () => {
    expect(roundLoad(87.5 * 0.7, 1.25, 'down')).toBe(61.25);
  });

  it('keeps an exact multiple unchanged: 100 → 100', () => {
    expect(roundLoad(100, 2.5, 'down')).toBe(100);
  });
});

describe('roundLoad up (challenge prefill)', () => {
  it.each([
    [98, 2.5, 100],
    [97.5, 2.5, 97.5],
    [98.7, 2.5, 100],
    [216.05, 5, 220],
  ])('rounds %s at a %s step up to %s', (value, increment, expected) => {
    expect(roundLoad(value, increment, 'up')).toBe(expected);
  });
});

describe('roundLoad increments', () => {
  it.each([
    [92.6859375, 1.25, 'nearest', 92.5, '92.6859 / 1.25 = 74.15 → 74 → 92.5'],
    [106.875, 1.25, 'nearest', 107.5, '106.875 / 1.25 = 85.5 → 86 → 107.5 (tie up)'],
    [121.125, 1.25, 'nearest', 121.25, '121.125 / 1.25 = 96.9 → 97 → 121.25'],
    [106.875, 1.25, 'down', 106.25, '106.875 / 1.25 = 85.5 → 85 → 106.25'],
    [92.6859375, 5, 'nearest', 95, '92.6859 / 5 = 18.54 → 19 → 95'],
    [111.223125, 5, 'nearest', 110, '111.2231 / 5 = 22.24 → 22 → 110'],
    [283.5, 2.5, 'nearest', 282.5, '283.5 lb / 2.5 = 113.4 → 113 → 282.5'],
    [283.5, 5, 'nearest', 285, '283.5 lb / 5 = 56.7 → 57 → 285'],
    [283.5, 10, 'nearest', 280, '283.5 lb / 10 = 28.35 → 28 → 280'],
    [287.5, 5, 'nearest', 290, '287.5 lb / 5 = 57.5 → 58 → 290 (tie up)'],
    [287.5, 5, 'down', 285, '287.5 lb / 5 = 57.5 → 57 → 285'],
    [295, 10, 'down', 290, '295 lb / 10 = 29.5 → 29 → 290'],
  ] as const)('rounds %s at increment %s (%s) to %s: %s', (value, increment, mode, expected, arithmetic) => {
    expect(roundLoad(value, increment, mode), arithmetic).toBe(expected);
  });

  it('normalises float noise to the increment decimals: 0.3 at increment 0.1 is exactly 0.3', () => {
    expect(roundLoad(0.3, 0.1, 'nearest')).toBe(0.3);
  });

  it('normalises float noise to the increment decimals: 0.7 at increment 0.1 is exactly 0.7, not 7 × 0.1 = 0.7000000000000001', () => {
    expect(roundLoad(0.7, 0.1, 'nearest')).toBe(0.7);
  });
});

describe('roundPrescribedLoad', () => {
  it('rounds with the enrollment setting: 106.875 at 2.5 kg nearest → 107.5', () => {
    expect(roundPrescribedLoad(106.875, DEFAULT_ROUNDING.kg)).toBe(107.5);
  });

  it('rounds with down mode when the enrollment asks for it: 101.25 → 100', () => {
    expect(roundPrescribedLoad(101.25, { ...DEFAULT_ROUNDING.kg, mode: 'down' })).toBe(100);
  });

  it('floors a kg load at the 20 kg bar: 40 × 0.40 = 16 → 20', () => {
    expect(roundPrescribedLoad(16, DEFAULT_ROUNDING.kg)).toBe(20);
  });

  it('floors an lb load at the 45 lb bar: 60 × 0.40 = 24 → 45', () => {
    expect(roundPrescribedLoad(24, DEFAULT_ROUNDING.lb)).toBe(45);
  });

  it('keeps a load equal to the bar: 20 kg → 20', () => {
    expect(roundPrescribedLoad(20, DEFAULT_ROUNDING.kg)).toBe(20);
  });

  it('applies the floor after rounding: 21.2 kg rounds to 20 and stays at the bar', () => {
    expect(roundPrescribedLoad(21.2, DEFAULT_ROUNDING.kg)).toBe(20);
  });

  it('floors at a custom bar weight: 12 kg with a 15 kg bar → 15', () => {
    expect(roundPrescribedLoad(12, { ...DEFAULT_ROUNDING.kg, barWeight: 15 })).toBe(15);
  });

  it('does not floor a load off the bar at the bar: a 12.5 kg dumbbell row stays 12.5', () => {
    expect(roundPrescribedLoad(12.5, DEFAULT_ROUNDING.kg, false)).toBe(12.5);
  });

  it('floors a load off the bar at one increment so it never reads 0: 1 kg → 2.5', () => {
    expect(roundPrescribedLoad(1, DEFAULT_ROUNDING.kg, false)).toBe(2.5);
  });
});

describe('DEFAULT_ROUNDING', () => {
  it('is 2.5 kg nearest with a 20 kg bar', () => {
    expect(DEFAULT_ROUNDING.kg).toEqual({ increment: 2.5, mode: 'nearest', barWeight: 20 });
  });

  it('is 5 lb nearest with a 45 lb bar', () => {
    expect(DEFAULT_ROUNDING.lb).toEqual({ increment: 5, mode: 'nearest', barWeight: 45 });
  });
});

describe('halfIncrementKg', () => {
  it('is 1.25 kg for a 2.5 kg increment', () => {
    expect(halfIncrementKg(DEFAULT_ROUNDING.kg, 'kg')).toBe(1.25);
  });

  it('is 0.625 kg for a 1.25 kg increment', () => {
    expect(halfIncrementKg({ ...DEFAULT_ROUNDING.kg, increment: 1.25 }, 'kg')).toBeCloseTo(0.625, 2);
  });

  it('is about 1.13 kg for a 5 lb increment (2.5 × 0.45359237 = 1.134)', () => {
    expect(halfIncrementKg(DEFAULT_ROUNDING.lb, 'lb')).toBeCloseTo(1.134, 2);
  });
});
