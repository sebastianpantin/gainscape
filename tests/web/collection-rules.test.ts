import { describe, expect, it } from 'vitest';
import type { Exercise, LiftExercise } from '../../web/src/lib/catalog-rules.ts';
import type { CollectionData } from '../../web/src/lib/collection-data.ts';
import {
  collectionDataFrom,
  collectionPercent,
  countCollection,
  emptySlots,
  pinProblemText,
  strengthText,
} from '../../web/src/lib/collection-rules.ts';

function exercise(id: string): LiftExercise {
  return {
    id,
    name: id,
    equipment: 'barbell',
    modality: 'lift',
    loadType: 'external',
    custom: false,
    archived: false,
    skillShares: [],
  };
}

const running: Exercise = {
  id: 'run',
  name: 'Running',
  equipment: 'bodyweight',
  modality: 'cardio',
  activity: { paceUnit: 'per_km', referencePaceSPerKm: 360, maxEffort: 'max', shares: [] },
  custom: false,
  archived: false,
  skillShares: [],
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
    expect(withPin.completion).toEqual({ filledSlots: 1, totalSlots: 10 });
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

  it('says the pins could not be updated for any other failure instead of the raw message', () => {
    expect(pinProblemText({ message: 'permission denied' })).toBe('Could not update pins.');
    expect(pinProblemText({ message: 'TypeError: Failed to fetch' })).toBe('Could not update pins.');
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

describe('strengthText', () => {
  const both = { e1rmKg: 100, repsCapacity: 12 };

  it('shows the reps capacity of a bodyweight exercise', () => {
    expect(strengthText(both, 'bodyweight', 'kg')).toBe('Capacity ~12 reps');
    expect(strengthText({ e1rmKg: 100, repsCapacity: null }, 'bodyweight', 'kg')).toBeNull();
  });

  it('shows the e1RM of every other load type in the chosen unit', () => {
    expect(strengthText(both, 'external', 'kg')).toBe('e1RM 100 kg');
    expect(strengthText(both, 'bodyweight_plus', 'lb')).toBe('e1RM 220.5 lb');
    expect(strengthText({ e1rmKg: null, repsCapacity: 12 }, 'external', 'kg')).toBeNull();
  });

  it('shows nothing without a strength estimate', () => {
    expect(strengthText(undefined, 'external', 'kg')).toBeNull();
  });
});

describe('collectionDataFrom', () => {
  const rows = {
    repMaxes: [
      { exercise_id: 'bench', reps: 5, load_kg: '82.50', exact_set_id: 'set-1' },
      { exercise_id: 'bench', reps: 1, load_kg: 100, exact_set_id: null },
    ],
    bodyweightRecords: [{ exercise_id: 'pull_up', max_reps: 12 }],
    strengths: [
      { exercise_id: 'bench', e1rm_kg: '96.25', reps_capacity: null },
      { exercise_id: 'pull_up', e1rm_kg: null, reps_capacity: 14 },
    ],
    pins: [
      { exercise_id: 'squat', position: 3 },
      { exercise_id: 'bench', position: 7 },
    ],
    cardioRecords: [{ exercise_id: 'run', kind: 'distance' as const, value: '5000.0' }],
  };

  it('places rep maxes in their rep slot with numeric loads and exactness', () => {
    const slots = collectionDataFrom(rows).repMaxesByExercise.get('bench');
    expect(slots).toHaveLength(10);
    expect(slots?.[0]).toEqual({ loadKg: 100, exact: false });
    expect(slots?.[4]).toEqual({ loadKg: 82.5, exact: true });
    expect(slots?.filter((slot) => slot !== null)).toHaveLength(2);
  });

  it('maps bodyweight records, strengths and cardio records to numbers', () => {
    const data = collectionDataFrom(rows);
    expect(data.maxRepsByExercise).toEqual(new Map([['pull_up', 12]]));
    expect(data.strengthByExercise).toEqual(
      new Map([
        ['bench', { e1rmKg: 96.25, repsCapacity: null }],
        ['pull_up', { e1rmKg: null, repsCapacity: 14 }],
      ]),
    );
    expect(data.cardioRecords).toEqual([{ exerciseId: 'run', kind: 'distance', value: 5000 }]);
  });

  it('keeps pin order and puts the next pin after the highest position', () => {
    const data = collectionDataFrom(rows);
    expect(data.pinnedExerciseIds).toEqual(['squat', 'bench']);
    expect(data.nextPinPosition).toBe(8);
  });

  it('starts the first pin at position zero when nothing is pinned', () => {
    expect(collectionDataFrom({ ...rows, pins: [] }).nextPinPosition).toBe(0);
  });
});

describe('emptySlots', () => {
  it('has one empty slot per rep max', () => {
    expect(emptySlots()).toEqual(Array.from({ length: 10 }, () => null));
  });
});
