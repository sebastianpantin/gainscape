import { describe, expect, it } from 'vitest';
import type { Exercise, LiftExercise } from '../../web/src/lib/catalog.ts';
import type { CollectionData } from '../../web/src/lib/collection-data.ts';
import { countCollection } from '../../web/src/lib/collection-rules.ts';

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
