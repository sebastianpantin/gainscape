import { describe, expect, it } from 'vitest';
import { LEVEL_UP_CELEBRATION, RECORD_CELEBRATION } from '../../web/src/lib/platform/celebration-effects.ts';

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
