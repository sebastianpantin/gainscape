import { describe, expect, it } from 'vitest';
import {
  FANFARE_CELEBRATIONS,
  LEVEL_UP_CELEBRATION,
  LEVEL_UP_CELEBRATIONS,
  RECORD_CELEBRATION,
} from '../../web/src/lib/platform/celebration-effects.ts';

const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);
const lengthS = (tones: typeof RECORD_CELEBRATION.tones) =>
  Math.max(...tones.map((tone) => tone.startS + tone.lengthS));

describe('RECORD_CELEBRATION', () => {
  it('is a two-note rising chirp', () => {
    expect(RECORD_CELEBRATION.tones).toHaveLength(2);
    const [first, second] = RECORD_CELEBRATION.tones;
    expect(second.frequencyHz).toBeGreaterThan(first.frequencyHz);
    expect(second.startS).toBeGreaterThanOrEqual(first.startS + first.lengthS);
  });

  it('stays much quieter and shorter than a level-up, since it can fire on every set', () => {
    expect(RECORD_CELEBRATION.volume).toBeLessThanOrEqual(LEVEL_UP_CELEBRATION.volume / 2);
    expect(lengthS(RECORD_CELEBRATION.tones)).toBeLessThan(lengthS(LEVEL_UP_CELEBRATION.tones) / 2);
    expect(total(RECORD_CELEBRATION.vibrationMs)).toBeLessThan(total(LEVEL_UP_CELEBRATION.vibrationMs) / 2);
  });
});

describe('LEVEL_UP_CELEBRATIONS', () => {
  it('keeps the familiar level-up chime for a plain level up', () => {
    expect(LEVEL_UP_CELEBRATIONS.normal).toBe(LEVEL_UP_CELEBRATION);
  });

  it('plays longer and buzzes more for a milestone, and most for level 99', () => {
    const { normal, milestone, max } = LEVEL_UP_CELEBRATIONS;
    expect(lengthS(milestone.tones)).toBeGreaterThan(lengthS(normal.tones));
    expect(lengthS(max.tones)).toBeGreaterThan(lengthS(milestone.tones));
    expect(total(milestone.vibrationMs)).toBeGreaterThan(total(normal.vibrationMs));
    expect(total(max.vibrationMs)).toBeGreaterThan(total(milestone.vibrationMs));
  });

  it('never gets louder than the legendary fanfare', () => {
    for (const celebration of Object.values(LEVEL_UP_CELEBRATIONS))
      expect(celebration.volume).toBeLessThanOrEqual(FANFARE_CELEBRATIONS.legendary.volume);
  });
});
