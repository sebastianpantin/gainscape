import { describe, expect, it } from 'vitest';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import type { CardioActivity, Exercise, LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type {
  CardioDraftExercise,
  DraftSet,
  LiftDraftExercise,
  WorkoutDraft,
} from '../../web/src/offline/draft-format.ts';
import { finishCountsOf } from '../../web/src/features/workout/workout-rules.ts';
import {
  addButtonKey,
  liftIdsToRecall,
  supersetMembers,
  swappableLifts,
  swapSuggestions,
  withPickedExercise,
} from '../../web/src/features/workout/workout-screen-rules.ts';

function set(id: string, overrides: Partial<DraftSet> = {}): DraftSet {
  return { id, weightKg: 100, reps: 5, effort: null, done: false, isWarmup: false, prescription: null, ...overrides };
}

function lift(exerciseId: string, sets: DraftSet[], overrides: Partial<LiftDraftExercise> = {}): LiftDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'lift',
    loadType: 'external',
    target: null,
    supersetId: null,
    sets,
    ...overrides,
  };
}

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

function draftOf(exercises: WorkoutDraft['exercises'], overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    sessionId: 'session',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    exercises,
    ...overrides,
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
