import { describe, expect, it } from 'vitest';
import {
  type CardioSetInput,
  DEFAULT_BALANCE,
  isNoOpEdit,
  type LiftSetInput,
  sameSet,
  type StoredCardioSet,
  type StoredLiftSet,
} from '@domain/index.ts';

const lift: LiftSetInput = {
  kind: 'lift',
  id: 'set-1',
  exerciseId: 'bench',
  position: 0,
  weightKg: 60,
  reps: 5,
  isWarmup: false,
  effort: { type: 'level', level: 'hard' },
};

const storedLift: StoredLiftSet = {
  kind: 'lift',
  id: 'set-1',
  exerciseId: 'bench',
  position: 0,
  weightKg: 60,
  effectiveLoadKg: 60,
  reps: 5,
  isWarmup: false,
  effortInputType: 'level',
  effortValue: DEFAULT_BALANCE.effortLevelRir.hard,
};

const bout: CardioSetInput = {
  kind: 'cardio',
  id: 'bout-1',
  exerciseId: 'sprints',
  position: 1,
  durationS: 570,
  distanceM: null,
  interval: { workS: 30, restS: 60, rounds: 7 },
  effort: { type: 'cardio', level: 'hard' },
};

const storedBout: StoredCardioSet = {
  kind: 'cardio',
  id: 'bout-1',
  exerciseId: 'sprints',
  position: 1,
  durationS: 570,
  distanceM: null,
  interval: { workS: 30, restS: 60, rounds: 7 },
  effortInputType: 'cardio',
  effortValue: 3,
};

describe('sameSet', () => {
  it('matches an identical lift set and an identical bout', () => {
    expect(sameSet(lift, storedLift, DEFAULT_BALANCE)).toBe(true);
    expect(sameSet(bout, storedBout, DEFAULT_BALANCE)).toBe(true);
  });

  it('reads a lift set without a kind as a lift', () => {
    expect(sameSet({ ...lift, kind: undefined }, storedLift, DEFAULT_BALANCE)).toBe(true);
  });

  it.each([
    ['weight', { weightKg: 62.5 }],
    ['reps', { reps: 6 }],
    ['warmup flag', { isWarmup: true }],
    ['position', { position: 2 }],
    ['exercise', { exerciseId: 'squat' }],
    ['effort written another way', { effort: { type: 'rir', value: DEFAULT_BALANCE.effortLevelRir.hard } }],
  ] as const)('notices a changed %s on a lift set', (_field, change) => {
    expect(sameSet({ ...lift, ...change }, storedLift, DEFAULT_BALANCE)).toBe(false);
  });

  it.each([
    ['duration', { durationS: 600 }],
    ['distance', { distanceM: 400 }],
    ['interval rest', { interval: { workS: 30, restS: 45, rounds: 7 } }],
    ['interval', { interval: null }],
    ['effort', { effort: { type: 'cardio', level: 'max' } }],
  ] as const)('notices a changed %s on a bout', (_field, change) => {
    expect(sameSet({ ...bout, ...change }, storedBout, DEFAULT_BALANCE)).toBe(false);
  });

  it('never matches a lift set against a stored bout or the reverse', () => {
    expect(
      sameSet(
        { ...lift, id: 'bout-1', exerciseId: 'sprints', position: 1, effort: null },
        { ...storedBout, effortInputType: null, effortValue: null },
        DEFAULT_BALANCE,
      ),
    ).toBe(false);
    expect(
      sameSet(
        { ...bout, id: 'set-1', exerciseId: 'bench', position: 0, effort: null },
        { ...storedLift, effortInputType: null, effortValue: null },
        DEFAULT_BALANCE,
      ),
    ).toBe(false);
  });
});

describe('isNoOpEdit', () => {
  const stored = new Map<string, StoredLiftSet | StoredCardioSet>([
    [storedLift.id, storedLift],
    [storedBout.id, storedBout],
  ]);

  it('is a no-op when notes and every set match', () => {
    expect(isNoOpEdit({ notes: 'ok', sets: [bout, lift] }, 'ok', stored, DEFAULT_BALANCE)).toBe(true);
  });

  it('is not a no-op when the notes change', () => {
    expect(isNoOpEdit({ notes: 'new', sets: [lift, bout] }, 'ok', stored, DEFAULT_BALANCE)).toBe(false);
  });

  it('is not a no-op when a set is removed, added or changed', () => {
    expect(isNoOpEdit({ notes: null, sets: [lift] }, null, stored, DEFAULT_BALANCE)).toBe(false);
    expect(isNoOpEdit({ notes: null, sets: [lift, { ...bout, id: 'bout-2' }] }, null, stored, DEFAULT_BALANCE)).toBe(
      false,
    );
    expect(isNoOpEdit({ notes: null, sets: [{ ...lift, reps: 6 }, bout] }, null, stored, DEFAULT_BALANCE)).toBe(false);
  });
});
