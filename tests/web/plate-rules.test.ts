import { describe, expect, it } from 'vitest';
import { platesLabel, platesPerSide } from '../../web/src/lib/plate-rules.ts';

describe('plates per side with the standard plates', () => {
  it('loads 100 kg on a 20 kg bar as 25 + 15 per side (40 kg a side)', () => {
    expect(platesPerSide(100, 20, 'kg')).toEqual([25, 15]);
  });

  it('loads 225 lb on a 45 lb bar as 45 + 45 per side (90 lb a side)', () => {
    expect(platesPerSide(225, 45, 'lb')).toEqual([45, 45]);
  });

  it('loads 60 kg on a 20 kg bar as a single 20 per side', () => {
    expect(platesPerSide(60, 20, 'kg')).toEqual([20]);
  });

  it('loads 102.5 kg on a 20 kg bar as 25 + 15 + 1.25 per side (41.25 kg a side)', () => {
    expect(platesPerSide(102.5, 20, 'kg')).toEqual([25, 15, 1.25]);
  });

  it('loads the Madcow 47.5 kg ramp set as 10 + 2.5 + 1.25 per side (13.75 kg a side)', () => {
    expect(platesPerSide(47.5, 20, 'kg')).toEqual([10, 2.5, 1.25]);
  });

  it('loads 185 lb on a 45 lb bar as 45 + 25 per side (70 lb a side)', () => {
    expect(platesPerSide(185, 45, 'lb')).toEqual([45, 25]);
  });

  it('loads 140 lb on a 45 lb bar as 45 + 2.5 per side (47.5 lb a side)', () => {
    expect(platesPerSide(140, 45, 'lb')).toEqual([45, 2.5]);
  });

  it('needs no plates when the weight is the bar alone', () => {
    expect(platesPerSide(20, 20, 'kg')).toEqual([]);
  });

  it('cannot load a weight lighter than the bar', () => {
    expect(platesPerSide(15, 20, 'kg')).toBeNull();
  });

  it('cannot load 101 kg, which leaves 0.5 kg a side that no plate covers', () => {
    expect(platesPerSide(101, 20, 'kg')).toBeNull();
  });

  it('cannot load 61.25 kg, which needs 0.625 kg a side', () => {
    expect(platesPerSide(61.25, 20, 'kg')).toBeNull();
  });

  it('cannot load 203.9 lb (a 92.5 kg set shown in pounds) on a 45 lb bar', () => {
    expect(platesPerSide(203.9, 45, 'lb')).toBeNull();
  });
});

describe('plates per side with the plates a gym has', () => {
  it('loads 100 kg as 20 + 20 when the gym has no 25 or 15 kg plates', () => {
    expect(platesPerSide(100, 20, 'kg', [20, 10, 5, 2.5])).toEqual([20, 20]);
  });

  it('lists the plates heaviest first whatever order the gym lists them in', () => {
    expect(platesPerSide(70, 20, 'kg', [5, 2.5, 20])).toEqual([20, 5]);
  });

  it('cannot load 102.5 kg when the gym has no 1.25 kg plates', () => {
    expect(platesPerSide(102.5, 20, 'kg', [25, 20, 15, 10, 5, 2.5])).toBeNull();
  });
});

describe('plates label', () => {
  it('joins the plates of one side: "25 + 15 per side"', () => {
    expect(platesLabel([25, 15])).toBe('25 + 15 per side');
  });

  it('reads a single plate as "20 per side"', () => {
    expect(platesLabel([20])).toBe('20 per side');
  });

  it('keeps fractional plates as they are: "25 + 15 + 1.25 per side"', () => {
    expect(platesLabel([25, 15, 1.25])).toBe('25 + 15 + 1.25 per side');
  });

  it('reads no plates as "Empty bar"', () => {
    expect(platesLabel([])).toBe('Empty bar');
  });

  it('has no label for a weight that cannot be loaded', () => {
    expect(platesLabel(null)).toBeNull();
  });
});
