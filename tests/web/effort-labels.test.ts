import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import {
  assumedEffort,
  CARDIO_EFFORT_LABELS,
  EFFORT_LEVEL_LABELS,
  EFFORT_LEVELS,
  effortLabel,
} from '../../web/src/lib/workout/effort-labels.ts';

describe('EFFORT_LEVELS', () => {
  it('orders the levels from easiest to hardest', () => {
    expect(EFFORT_LEVELS).toEqual(['easy', 'moderate', 'hard', 'near_failure', 'failure']);
  });
});

describe('effortLabel', () => {
  it('labels stored effort', () => {
    expect(effortLabel({ type: 'level', level: 'near_failure' })).toBe('Near fail');
    expect(effortLabel({ type: 'level', level: 'moderate' })).toBe('Moderate');
    expect(effortLabel({ type: 'rpe', value: 8.5 })).toBe('RPE 8.5');
    expect(effortLabel({ type: 'rir', value: 2 })).toBe('RIR 2');
    expect(effortLabel({ type: 'cardio', level: 'moderate' })).toBe('Moderate');
    expect(effortLabel({ type: 'cardio', level: 'max' })).toBe('Max');
    expect(effortLabel(null)).toBeNull();
  });

  it('has a label for every lift and cardio effort level', () => {
    expect(EFFORT_LEVEL_LABELS).toEqual({
      easy: 'Easy',
      moderate: 'Moderate',
      hard: 'Hard',
      near_failure: 'Near fail',
      failure: 'Failure',
    });
    expect(CARDIO_EFFORT_LABELS).toEqual({ easy: 'Easy', moderate: 'Moderate', hard: 'Hard', max: 'Max' });
  });
});

describe('assumedEffort', () => {
  const levelRir = DEFAULT_BALANCE.effortLevelRir;

  it('picks the RIR choice of the estimate, with 6+ for anything above 6', () => {
    expect(assumedEffort('rir', 2, levelRir)).toEqual({ type: 'rir', value: 2 });
    expect(assumedEffort('rir', 9, levelRir)).toEqual({ type: 'rir', value: 6 });
  });

  it('picks RPE 10 minus the estimate, and none when that falls below the lowest RPE choice', () => {
    expect(assumedEffort('rpe', 2, levelRir)).toEqual({ type: 'rpe', value: 8 });
    expect(assumedEffort('rpe', 4, levelRir)).toEqual({ type: 'rpe', value: 6 });
    expect(assumedEffort('rpe', 5, levelRir)).toBeNull();
  });

  it('picks the nearest effort level, the harder one on a tie', () => {
    expect(assumedEffort('level', 3, levelRir)).toEqual({ type: 'level', level: 'hard' });
    expect(assumedEffort('level', 0, levelRir)).toEqual({ type: 'level', level: 'failure' });
    expect(assumedEffort('level', 2, levelRir)).toEqual({ type: 'level', level: 'near_failure' });
    expect(assumedEffort('level', 3.5, levelRir)).toEqual({ type: 'level', level: 'hard' });
    expect(assumedEffort('level', 4, levelRir)).toEqual({ type: 'level', level: 'moderate' });
    expect(assumedEffort('level', 4.5, levelRir)).toEqual({ type: 'level', level: 'moderate' });
    expect(assumedEffort('level', 8, levelRir)).toEqual({ type: 'level', level: 'easy' });
  });
});
