import { describe, expect, it } from 'vitest';
import type { Exercise, LiftExercise } from '../../web/src/lib/catalog-rules.ts';
import type { CollectionData } from '../../web/src/lib/collection-data.ts';
import { collectionPercent, countCollection, pinProblemText } from '../../web/src/lib/collection-rules.ts';

function exercise(id: string): LiftExercise {
  return { id, name: id, equipment: 'barbell', modality: 'lift', loadType: 'external', custom: false, archived: false };
}

const running: Exercise = {
  id: 'run',
  name: 'Running',
  equipment: 'bodyweight',
  modality: 'cardio',
  activity: { paceUnit: 'per_km', referencePaceSPerKm: 360, maxEffort: 'max', shares: [] },
  custom: false,
  archived: false,
};

function data(pinnedExerciseIds: string[]): CollectionData {
  return {
    repMaxesByExercise: new Map([
      ['bench', [{ loadKg: 100, exact: true }, null, null, null, null, null, null, null, null, null]],
    ]),
    maxRepsByExercise: new Map(),
    strengthByExercise: new Map(),
    pinnedExerciseIds,
    nextPinPosition: pinnedExerciseIds.length,
    cardioRecords: [],
  };
}

describe('collection rules', () => {
  it('skips a pinned cardio exercise in the lists and the completion', () => {
    const exercises = [exercise('bench'), running];
    const withPin = countCollection(exercises, data(['run']));
    const withoutPin = countCollection(exercises, data([]));
    expect(withPin.pinned).toEqual([]);
    expect(withPin.counted.map((counted) => counted.id)).toEqual(['bench']);
    expect(withPin.completion).toEqual(withoutPin.completion);
    expect(withPin.completion).toEqual({ filledSlots: 1, totalSlots: 10, fraction: 0.1 });
  });
});

describe('pin problems', () => {
  it('explains the pin cap', () => {
    expect(pinProblemText({ message: 'too_many_pins' })).toBe('You can pin up to 50 exercises. Unpin one first.');
  });

  it('turns a pin rate limit into a wait message', () => {
    expect(pinProblemText({ code: 'PT429', message: 'rate_limited', details: '{"retryAfterSeconds":20}' })).toBe(
      'Too many changes in a short time. Try again in 1 min.',
    );
  });

  it('passes any other message through', () => {
    expect(pinProblemText({ message: 'permission denied' })).toBe('permission denied');
  });
});

describe('collectionPercent', () => {
  it('rounds the filled share to a whole percent and treats an empty collection as 0', () => {
    expect(collectionPercent(0, 0)).toBe(0);
    expect(collectionPercent(1, 3)).toBe(33);
    expect(collectionPercent(2, 3)).toBe(67);
    expect(collectionPercent(10, 10)).toBe(100);
  });
});
