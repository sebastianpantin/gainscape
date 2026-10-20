import { describe, expect, it } from 'vitest';
import { draftOf, lift, set } from './draft-fixtures.ts';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import type { CardioActivity, Exercise, LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { CardioDraftExercise } from '../../web/src/offline/draft-format.ts';
import { finishCountsOf } from '../../web/src/features/workout/workout-rules.ts';
import {
  addButtonKey,
  liftIdsToRecall,
  removedSetAt,
  removedSetText,
  restoreRemovedSet,
  supersetMembers,
  swappableLifts,
  swapSuggestions,
  withPickedExercise,
} from '../../web/src/features/workout/workout-screen-rules.ts';

const ACTIVITY: CardioActivity = {
  paceUnit: 'per_km',
  referencePaceSPerKm: 300,
  maxEffort: 'hard',
  tracksDistance: true,
  shares: [],
};

function cardio(exerciseId: string): CardioDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'cardio',
    activity: ACTIVITY,
    sets: [],
  };
}

function catalogLift(id: string, overrides: Partial<LiftExercise> = {}): LiftExercise {
  return {
    id,
    name: id,
    equipment: 'barbell',
    custom: false,
    archived: false,
    skillShares: [{ skillKey: 'chest', skillName: 'Chest', shareBasisPoints: 10_000 }],
    modality: 'lift',
    loadType: 'external',
    ...overrides,
  };
}

const ROW: Exercise = {
  id: 'row',
  name: 'Row',
  equipment: 'other',
  custom: false,
  archived: false,
  skillShares: [],
  modality: 'cardio',
  activity: ACTIVITY,
};

describe('liftIdsToRecall', () => {
  it('lists the lift exercise ids of an open draft and skips cardio', () => {
    expect(liftIdsToRecall(draftOf([lift('bench', []), cardio('row'), lift('squat', [])]))).toEqual(['bench', 'squat']);
  });

  it('recalls nothing without a draft or once the draft is finished', () => {
    expect(liftIdsToRecall(null)).toEqual([]);
    expect(liftIdsToRecall(draftOf([lift('bench', [])], { finishedAt: '2026-10-01T11:00:00.000Z' }))).toEqual([]);
  });
});

describe('swappableLifts and swapSuggestions', () => {
  const bench = catalogLift('bench', { name: 'Barbell bench press' });
  const incline = catalogLift('incline', { name: 'Incline bench press' });
  const plank = catalogLift('plank', { measure: 'time' });

  it('offers lifts only, never holds or cardio', () => {
    expect(swappableLifts([bench, plank, ROW, incline]).map((exercise) => exercise.id)).toEqual(['bench', 'incline']);
  });

  it('suggests similar lifts for a known exercise and nothing for an unknown one', () => {
    const lifts = swappableLifts([bench, incline]);
    expect(swapSuggestions('bench', lifts).map((exercise) => exercise.id)).toEqual(['incline']);
    expect(swapSuggestions('missing', lifts)).toEqual([]);
  });

  it('suggests at most six lifts', () => {
    const many = Array.from({ length: 9 }, (_, index) => catalogLift(`press-${index}`));
    expect(swapSuggestions('press-0', many)).toHaveLength(6);
  });
});

describe('withPickedExercise', () => {
  it('adds a lift with one set seeded from the last session', () => {
    const added = withPickedExercise(draftOf([]), catalogLift('bench'), { weightKg: 80, reps: 6 });
    const [exercise] = added.exercises;
    expect(exercise).toMatchObject({ exerciseId: 'bench', modality: 'lift', loadType: 'external' });
    expect(exercise.sets).toEqual([expect.objectContaining({ weightKg: 80, reps: 6, done: false, isWarmup: false })]);
  });

  it('adds a lift with a default set when nothing was logged before', () => {
    const added = withPickedExercise(draftOf([]), catalogLift('bench'), undefined);
    expect(added.exercises[0].sets).toEqual([expect.objectContaining({ weightKg: 20, reps: 8 })]);
  });

  it('adds a hold with one set of its measure', () => {
    const added = withPickedExercise(draftOf([]), catalogLift('plank', { measure: 'time' }), { weightKg: 80, reps: 6 });
    expect(added.exercises[0]).toMatchObject({ modality: 'hold', measure: 'time' });
    expect(added.exercises[0].sets).toEqual([expect.objectContaining({ kind: 'hold', durationS: 30, weightKg: 20 })]);
  });

  it('adds cardio with one bout', () => {
    const added = withPickedExercise(draftOf([]), ROW, undefined);
    expect(added.exercises[0]).toMatchObject({ modality: 'cardio', activity: ACTIVITY });
    expect(added.exercises[0].sets).toEqual([expect.objectContaining({ kind: 'cardio', durationS: 1800 })]);
  });

  it('adds nothing to a full workout', () => {
    const full = draftOf([
      lift(
        'bench',
        Array.from({ length: MAX_SETS_PER_SESSION }, (_, index) => set(`s${index}`)),
      ),
    ]);
    expect(withPickedExercise(full, catalogLift('squat'), undefined)).toBe(full);
  });
});

describe('addButtonKey', () => {
  it('is the card key of a lone exercise and the superset key inside a group', () => {
    const draft = draftOf([
      lift('bench', [set('a')], { supersetId: 'pair' }),
      lift('row', [set('b')], { supersetId: 'pair' }),
      lift('squat', [set('c')]),
    ]);
    expect(addButtonKey(draft, 0)).toBe('superset-pair');
    expect(addButtonKey(draft, 1)).toBe('superset-pair');
    expect(addButtonKey(draft, 2)).toBe('card-squat');
  });
});

describe('supersetMembers', () => {
  it('pairs each grouped lift with its index', () => {
    const bench = lift('bench', [], { supersetId: 'pair' });
    const row = lift('row', [], { supersetId: 'pair' });
    const draft = draftOf([lift('squat', []), bench, row]);
    expect(supersetMembers(draft, { id: 'pair', exerciseIndexes: [1, 2] })).toEqual([
      { index: 1, exercise: bench },
      { index: 2, exercise: row },
    ]);
  });

  it('skips indexes that are not lifts', () => {
    const draft = draftOf([cardio('row')]);
    expect(supersetMembers(draft, { id: 'pair', exerciseIndexes: [0, 1] })).toEqual([]);
  });
});

describe('finishCountsOf', () => {
  it('counts done, planned and left-to-lifter sets', () => {
    const draft = draftOf([
      lift('bench', [
        set('a', { done: true }),
        set('b'),
        set('c', { prescriptionDetail: { pct: null, optional: true } }),
      ]),
    ]);
    expect(finishCountsOf(draft)).toEqual({ done: 1, planned: 2, leftToLifter: 1 });
  });
});

describe('removedSetAt and restoreRemovedSet', () => {
  const bench = lift('bench', [set('a'), set('b', { weightKg: 80 }), set('c')]);

  it('remembers which card the set left and where it sat', () => {
    expect(removedSetAt(draftOf([bench]), 0, 'b')).toEqual({
      clientId: 'card-bench',
      index: 1,
      set: set('b', { weightKg: 80 }),
    });
    expect(removedSetAt(draftOf([bench]), 0, 'missing')).toBeNull();
  });

  it('puts the set back at its place in the same card, even after cards above it moved', () => {
    const removed = removedSetAt(draftOf([bench]), 0, 'b')!;
    const afterRemoval = draftOf([lift('row', [set('r')]), lift('bench', [set('a'), set('c')])]);
    const restored = restoreRemovedSet(afterRemoval, removed);
    expect(restored.exercises[1].sets.map((restoredSet) => restoredSet.id)).toEqual(['a', 'b', 'c']);
    expect(restored.exercises[0]).toBe(afterRemoval.exercises[0]);
  });

  it('appends the set when sets after it were removed too', () => {
    const removed = removedSetAt(draftOf([bench]), 0, 'c')!;
    const restored = restoreRemovedSet(draftOf([lift('bench', [set('a')])]), removed);
    expect(restored.exercises[0].sets.map((restoredSet) => restoredSet.id)).toEqual(['a', 'c']);
  });

  it('leaves the draft alone when the card is gone, the set is back already or the workout is finished', () => {
    const removed = removedSetAt(draftOf([bench]), 0, 'b')!;
    const withoutCard = draftOf([lift('row', [set('r')])]);
    expect(restoreRemovedSet(withoutCard, removed)).toBe(withoutCard);
    const alreadyBack = draftOf([bench]);
    expect(restoreRemovedSet(alreadyBack, removed)).toBe(alreadyBack);
    const finished = draftOf([lift('bench', [set('a'), set('c')])], { finishedAt: '2026-10-01T11:00:00.000Z' });
    expect(restoreRemovedSet(finished, removed)).toBe(finished);
  });

  it('leaves the draft alone when it is already at the set limit', () => {
    const removed = removedSetAt(draftOf([bench]), 0, 'b')!;
    const full = draftOf([
      lift(
        'bench',
        Array.from({ length: MAX_SETS_PER_SESSION }, (_, index) => set(`full-${index}`)),
      ),
    ]);
    expect(restoreRemovedSet(full, removed)).toBe(full);
  });
});

describe('removedSetAt and restoreRemovedSet for cardio', () => {
  const bout = (id: string, durationS: number) => ({
    id,
    kind: 'cardio' as const,
    durationS,
    distanceM: null,
    interval: null,
    effort: null,
    done: true,
  });

  it('leaves the draft alone when the bout would go past the cardio time cap', () => {
    const rowing = { ...cardio('rowing'), sets: [bout('short', 600)] };
    const removed = removedSetAt(draftOf([rowing]), 0, 'short')!;
    const full = draftOf([{ ...cardio('rowing'), sets: [bout('long', 4 * 60 * 60)] }]);
    expect(restoreRemovedSet(full, removed)).toBe(full);
  });

  it('calls a cardio set a bout and a lift set a set', () => {
    expect(removedSetText(cardio('Rowing'), 0)).toBe('Removed bout 1 of Rowing.');
    expect(removedSetText(lift('Barbell Row', [set('a')]), 1)).toBe('Removed set 2 of Barbell Row.');
  });
});
