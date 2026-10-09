import { describe, expect, it } from 'vitest';
import {
  barbellPlates,
  barbellPlatesText,
  DEFAULT_PLATE_SETTINGS,
  nearestLoadable,
  parsePlateSettings,
  PLATE_CHOICES,
  plateLook,
  platesPerSide,
} from '../../web/src/lib/plate-rules.ts';

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

  it('loads 60 kg as 10 + 10 per side with only 15 and 10 kg plates, which heaviest-first filling misses', () => {
    expect(platesPerSide(60, 20, 'kg', [15, 10])).toEqual([10, 10]);
  });

  it('loads heaviest first like a gym does: 165 lb as 45 + 10 + 5 per side, not 35 + 25', () => {
    expect(platesPerSide(165, 45, 'lb')).toEqual([45, 10, 5]);
    expect(platesPerSide(255, 45, 'lb')).toEqual([45, 45, 10, 5]);
  });

  it('loads on a 15 kg bar', () => {
    expect(platesPerSide(55, 15, 'kg')).toEqual([20]);
  });

  it('loads only the bar when the gym has no plates', () => {
    expect(platesPerSide(20, 20, 'kg', [])).toEqual([]);
    expect(platesPerSide(40, 20, 'kg', [])).toBeNull();
  });

  it('loads 1000 kg a side quickly with small plates', () => {
    expect(platesPerSide(2020, 20, 'kg', [25, 0.5])).toHaveLength(40);
  });
});

describe('nearest loadable weight', () => {
  it('keeps a weight the plates load exactly', () => {
    expect(nearestLoadable(102.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toBe(102.5);
  });

  it('rounds 101 kg to 100 kg, which is 0.5 kg a side away instead of 0.75', () => {
    expect(nearestLoadable(101, 20, [25, 20, 15, 10, 5, 2.5, 1.25])).toBe(100);
  });

  it('rounds up when the heavier weight is nearer: 104 kg to 105 kg with 2.5 kg as the smallest plate', () => {
    expect(nearestLoadable(104, 20, [25, 20, 15, 10, 5, 2.5])).toBe(105);
  });

  it('takes the lighter weight on a tie: 102.5 kg between 100 and 105 kg', () => {
    expect(nearestLoadable(102.5, 20, [25, 20, 15, 10, 5, 2.5])).toBe(100);
  });

  it('rounds a weight below the bar up to the bar', () => {
    expect(nearestLoadable(12.5, 20, [25])).toBe(20);
  });

  it('rounds to the bar when the gym has no plates', () => {
    expect(nearestLoadable(60, 20, [])).toBe(20);
  });

  it('rounds 203.9 lb on a 45 lb bar to 205 lb', () => {
    expect(nearestLoadable(203.9, 45, [45, 35, 25, 10, 5, 2.5])).toBe(205);
  });
});

describe('barbell plates text', () => {
  const kgSetup = DEFAULT_PLATE_SETTINGS.kg;

  it('shows the plates of a weight that loads exactly', () => {
    expect(barbellPlatesText(92.5, kgSetup, 'kg')).toBe('25 + 10 + 1.25 kg each side');
  });

  it('shows "Empty bar" at the bar weight', () => {
    expect(barbellPlatesText(20, kgSetup, 'kg')).toBe('Empty bar');
  });

  it('shows the nearest loadable weight and its plates when the weight does not load exactly', () => {
    expect(barbellPlatesText(101, kgSetup, 'kg')).toBe('Nearest 100 kg: 25 + 15 kg each side');
  });

  it('shows the bar as the nearest weight below the bar', () => {
    expect(barbellPlatesText(10, kgSetup, 'kg')).toBe('Nearest 20 kg: Empty bar');
  });

  it('uses the bar and plates of the setup', () => {
    expect(barbellPlatesText(55, { barWeight: 15, plates: [10, 5] }, 'kg')).toBe('2×10 kg each side');
    expect(barbellPlatesText(135, { barWeight: 45, plates: [45] }, 'lb')).toBe('45 lb each side');
  });
});

describe('plate settings', () => {
  it('defaults to a 20 kg bar and a 45 lb bar with the standard plates', () => {
    expect(DEFAULT_PLATE_SETTINGS).toEqual({
      kg: { barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
      lb: { barWeight: 45, plates: [45, 35, 25, 10, 5, 2.5] },
    });
    expect(parsePlateSettings(null)).toEqual(DEFAULT_PLATE_SETTINGS);
    expect(parsePlateSettings('not json')).toEqual(DEFAULT_PLATE_SETTINGS);
  });

  it('offers the default plates among the plate choices of each unit', () => {
    for (const unit of ['kg', 'lb'] as const) {
      expect(PLATE_CHOICES[unit]).toEqual(expect.arrayContaining(DEFAULT_PLATE_SETTINGS[unit].plates));
    }
  });

  it('keeps a saved bar and plates per unit, heaviest first', () => {
    const saved = JSON.stringify({ kg: { barWeight: 15, plates: [2.5, 20, 10] }, lb: { barWeight: 35, plates: [] } });
    expect(parsePlateSettings(saved)).toEqual({
      kg: { barWeight: 15, plates: [20, 10, 2.5] },
      lb: { barWeight: 35, plates: [] },
    });
  });

  it('falls back per unit and per field when a saved value is not valid', () => {
    const saved = JSON.stringify({
      kg: { barWeight: -5, plates: [20, 'big', 0, 20, 3000] },
      lb: { barWeight: 'heavy', plates: 'all' },
    });
    expect(parsePlateSettings(saved)).toEqual({
      kg: { barWeight: 20, plates: [20] },
      lb: DEFAULT_PLATE_SETTINGS.lb,
    });
  });
});

describe('barbell plates', () => {
  const kgSetup = DEFAULT_PLATE_SETTINGS.kg;

  it('gives the plates of one side, heaviest first, and no nearest weight when the weight loads exactly', () => {
    expect(barbellPlates(92.5, kgSetup, 'kg')).toEqual({ plates: [25, 10, 1.25], nearest: null });
  });

  it('gives the nearest loadable weight and its plates when the weight does not load exactly', () => {
    expect(barbellPlates(101, kgSetup, 'kg')).toEqual({ plates: [25, 15], nearest: 100 });
    expect(barbellPlates(10, kgSetup, 'kg')).toEqual({ plates: [], nearest: 20 });
  });
});

describe('plate look', () => {
  it('colours kg plates like competition plates and sizes them by weight', () => {
    expect(plateLook(25, 'kg')).toEqual({ tone: 'red', size: 'full' });
    expect(plateLook(20, 'kg')).toEqual({ tone: 'blue', size: 'full' });
    expect(plateLook(15, 'kg')).toEqual({ tone: 'yellow', size: 'full' });
    expect(plateLook(10, 'kg')).toEqual({ tone: 'green', size: 'large' });
    expect(plateLook(5, 'kg')).toEqual({ tone: 'white', size: 'medium' });
    expect(plateLook(2.5, 'kg')).toEqual({ tone: 'red', size: 'small' });
    expect(plateLook(1.25, 'kg')).toEqual({ tone: 'steel', size: 'small' });
  });

  it('colours lb plates like the kg plate of about the same weight', () => {
    expect(plateLook(45, 'lb')).toEqual({ tone: 'blue', size: 'full' });
    expect(plateLook(35, 'lb')).toEqual({ tone: 'yellow', size: 'full' });
    expect(plateLook(25, 'lb')).toEqual({ tone: 'green', size: 'large' });
    expect(plateLook(10, 'lb')).toEqual({ tone: 'white', size: 'medium' });
    expect(plateLook(2.5, 'lb')).toEqual({ tone: 'steel', size: 'small' });
  });
});
