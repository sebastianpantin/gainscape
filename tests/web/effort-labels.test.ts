import { describe, expect, it } from 'vitest';
import { CARDIO_EFFORT_LABELS, EFFORT_LEVEL_LABELS, effortLabel } from '../../web/src/lib/effort-labels.ts';

describe('effortLabel', () => {
  it('labels stored effort', () => {
    expect(effortLabel({ type: 'level', level: 'near_failure' })).toBe('Near fail');
    expect(effortLabel({ type: 'rpe', value: 8.5 })).toBe('RPE 8.5');
    expect(effortLabel({ type: 'rir', value: 2 })).toBe('RIR 2');
    expect(effortLabel({ type: 'cardio', level: 'moderate' })).toBe('Moderate');
    expect(effortLabel({ type: 'cardio', level: 'max' })).toBe('Max');
    expect(effortLabel(null)).toBeNull();
  });

  it('has a label for every lift and cardio effort level', () => {
    expect(EFFORT_LEVEL_LABELS).toEqual({ easy: 'Easy', hard: 'Hard', near_failure: 'Near fail', failure: 'Failure' });
    expect(CARDIO_EFFORT_LABELS).toEqual({ easy: 'Easy', moderate: 'Moderate', hard: 'Hard', max: 'Max' });
  });
});
