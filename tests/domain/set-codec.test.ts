import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type CardioSetInput,
  decodeStoredSet,
  encodeStoredSet,
  type HoldSetInput,
  type LiftSetInput,
  STORED_SET_COLUMNS,
  type StoredSetColumns,
  storedSetColumnRow,
  storedSetColumnsOf,
  storedWeightKg,
  UnknownSetKindError,
} from '@domain/index.ts';

const EFFORT = { effortInputType: 'rir' as const, effortValue: 2 };

const LIFT_COLUMNS: StoredSetColumns = {
  id: 'set-1',
  exerciseId: 'bench',
  position: 0,
  weightKg: 100,
  effectiveLoadKg: 100,
  reps: 5,
  isWarmup: false,
  effortInputType: 'rir',
  effortValue: 2,
  durationS: null,
  distanceM: null,
  intervalWorkS: null,
  intervalRestS: null,
  intervalRounds: null,
  countedWorkS: null,
};

const CARDIO_COLUMNS: StoredSetColumns = {
  ...LIFT_COLUMNS,
  weightKg: null,
  effectiveLoadKg: null,
  reps: null,
  effortInputType: 'cardio',
  effortValue: 3,
  durationS: 600,
  distanceM: 2000,
  intervalWorkS: 30,
  intervalRestS: 30,
  intervalRounds: 10,
  countedWorkS: 300,
};

const HOLD_COLUMNS: StoredSetColumns = {
  ...LIFT_COLUMNS,
  weightKg: 20,
  effectiveLoadKg: 20,
  reps: null,
  durationS: null,
  distanceM: 40,
};

describe('decodeStoredSet', () => {
  it('decodes each set kind the database allows', () => {
    expect(decodeStoredSet(LIFT_COLUMNS)).toEqual({
      kind: 'lift',
      id: 'set-1',
      exerciseId: 'bench',
      position: 0,
      effortInputType: 'rir',
      effortValue: 2,
      weightKg: 100,
      effectiveLoadKg: 100,
      reps: 5,
      isWarmup: false,
    });
    expect(decodeStoredSet(CARDIO_COLUMNS)).toMatchObject({
      kind: 'cardio',
      durationS: 600,
      distanceM: 2000,
      interval: { workS: 30, restS: 30, rounds: 10 },
    });
    expect(
      decodeStoredSet({ ...CARDIO_COLUMNS, intervalWorkS: null, intervalRestS: null, intervalRounds: null }),
    ).toMatchObject({ kind: 'cardio', interval: null });
    expect(decodeStoredSet(HOLD_COLUMNS)).toMatchObject({
      kind: 'hold',
      weightKg: 20,
      effectiveLoadKg: 20,
      durationS: null,
      distanceM: 40,
    });
  });

  it('throws on columns that match no set kind instead of guessing one', () => {
    const noKind = { ...LIFT_COLUMNS, reps: null, weightKg: null, effectiveLoadKg: null };
    const holdWithBothMeasures = { ...HOLD_COLUMNS, durationS: 30 };
    const holdWithCountedWork = { ...HOLD_COLUMNS, countedWorkS: 40 };
    for (const columns of [noKind, holdWithBothMeasures, holdWithCountedWork]) {
      expect(() => decodeStoredSet(columns)).toThrow(UnknownSetKindError);
    }
  });
});

describe('stored set column rows', () => {
  it('names every stored set column once', () => {
    expect(new Set(STORED_SET_COLUMNS).size).toBe(STORED_SET_COLUMNS.length);
    expect(Object.keys(storedSetColumnRow(LIFT_COLUMNS)).sort()).toEqual([...STORED_SET_COLUMNS].sort());
  });

  it('reads numeric columns that arrive as strings', () => {
    const row = {
      ...storedSetColumnRow(HOLD_COLUMNS),
      weight_kg: '20.50',
      effective_load_kg: '20.50',
      effort_value: '2',
      distance_m: '40.0',
    };
    expect(storedSetColumnsOf(row)).toEqual({
      ...HOLD_COLUMNS,
      weightKg: 20.5,
      effectiveLoadKg: 20.5,
      effortValue: 2,
      distanceM: 40,
    });
  });

  it('round-trips columns through a row', () => {
    for (const columns of [LIFT_COLUMNS, CARDIO_COLUMNS, HOLD_COLUMNS]) {
      expect(storedSetColumnsOf(storedSetColumnRow(columns))).toEqual(columns);
    }
  });
});

describe('encodeStoredSet', () => {
  const lift: LiftSetInput = {
    kind: 'lift',
    id: 'set-1',
    exerciseId: 'bench',
    position: 0,
    weightKg: 100,
    reps: 5,
    isWarmup: true,
    effort: null,
  };

  it('encodes a set so it decodes back to the same values', () => {
    const weight = fc.integer({ min: 0, max: 200_000 }).map((hundredths) => hundredths / 100);
    const id = fc.constant('set-1');
    const lifts = fc.record({ weightKg: weight, reps: fc.integer({ min: 1, max: 100 }), isWarmup: fc.boolean() });
    const holds = fc.record({
      weightKg: weight,
      measure: fc.oneof(
        fc.record({ durationS: fc.integer({ min: 1, max: 3600 }), distanceM: fc.constant(null) }),
        fc.record({ durationS: fc.constant(null), distanceM: fc.integer({ min: 1, max: 10_000 }) }),
      ),
    });
    const bouts = fc.record({
      durationS: fc.integer({ min: 1, max: 14_400 }),
      distanceM: fc.option(fc.integer({ min: 1, max: 100_000 })),
      interval: fc.option(
        fc.record({
          workS: fc.integer({ min: 1, max: 600 }),
          restS: fc.integer({ min: 0, max: 600 }),
          rounds: fc.integer({ min: 1, max: 50 }),
        }),
      ),
    });
    fc.assert(
      fc.property(id, lifts, holds, bouts, (setId, liftValues, holdValues, boutValues) => {
        const liftSet: LiftSetInput = { ...lift, id: setId, ...liftValues };
        const hold: HoldSetInput = {
          kind: 'hold',
          id: setId,
          exerciseId: 'plank',
          position: 1,
          weightKg: holdValues.weightKg,
          ...holdValues.measure,
          effort: null,
        };
        const bout: CardioSetInput = {
          kind: 'cardio',
          id: setId,
          exerciseId: 'row',
          position: 2,
          ...boutValues,
          effort: null,
        };
        expect(decodeStoredSet(encodeStoredSet(liftSet, liftValues.weightKg, EFFORT))).toMatchObject({
          kind: 'lift',
          ...liftValues,
          effectiveLoadKg: liftValues.weightKg,
          ...EFFORT,
        });
        expect(decodeStoredSet(encodeStoredSet(hold, holdValues.weightKg, EFFORT))).toMatchObject({
          kind: 'hold',
          weightKg: holdValues.weightKg,
          ...holdValues.measure,
        });
        expect(decodeStoredSet(encodeStoredSet(bout, null, EFFORT))).toMatchObject({ kind: 'cardio', ...boutValues });
      }),
    );
  });

  it('counts a bout’s work and stores no load for it', () => {
    const bout: CardioSetInput = {
      kind: 'cardio',
      id: 'bout-1',
      exerciseId: 'row',
      position: 0,
      durationS: 600,
      distanceM: null,
      interval: { workS: 30, restS: 30, rounds: 10 },
      effort: null,
    };
    expect(encodeStoredSet(bout, 99, EFFORT)).toMatchObject({
      weightKg: null,
      effectiveLoadKg: null,
      reps: null,
      isWarmup: false,
      countedWorkS: 300,
    });
  });
});

describe('storedWeightKg', () => {
  it('keeps the two decimals the database stores', () => {
    expect(storedWeightKg(100.004)).toBe(100);
    expect(storedWeightKg(62.506)).toBe(62.51);
  });
});
