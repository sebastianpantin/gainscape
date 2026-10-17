import { describe, expect, it } from 'vitest';
import { type Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  canHaveLiftGoal,
  deadlineText,
  type GoalRepMaxRow,
  type LiftGoal,
  liftGoalDraft,
  liftGoalInput,
  liftGoalProgressText,
  liftGoalStatus,
  liftGoalStatuses,
  liftGoalTargetText,
  type LiftGoalRow,
  toLiftGoal,
} from '../../web/src/lib/progress/lift-goal-rules.ts';

const BENCH = 'bench-id';
const SQUAT = 'squat-id';

const benchGoal: LiftGoal = {
  exerciseId: BENCH,
  exerciseName: 'Bench Press',
  loadType: 'external',
  targetKg: 100,
  reps: 5,
  targetDate: '2026-12-01',
};

function repMax(reps: number, loadKg: number, achievedAt: string, exerciseId = BENCH): GoalRepMaxRow {
  return { exercise_id: exerciseId, reps, load_kg: loadKg, achieved_at: achievedAt };
}

function lift(overrides: Partial<Extract<Exercise, { modality: 'lift' }>>): Exercise {
  return {
    id: 'lift-id',
    name: 'Lift',
    equipment: 'barbell',
    custom: false,
    archived: false,
    skillShares: [],
    modality: 'lift',
    loadType: 'external',
    compound: true,
    ...overrides,
  };
}

describe('lift goal rows', () => {
  it('reads a goal row with its exercise and numeric strings', () => {
    const row: LiftGoalRow = {
      exercise_id: BENCH,
      target_kg: '102.06',
      reps: 3,
      target_date: null,
      exercises: { name: 'Bench Press', load_type: 'bodyweight_plus' },
    };
    expect(toLiftGoal(row)).toEqual({
      exerciseId: BENCH,
      exerciseName: 'Bench Press',
      loadType: 'bodyweight_plus',
      targetKg: 102.06,
      reps: 3,
      targetDate: null,
    });
  });
});

describe('lift goal achievement', () => {
  it('is not achieved without any record', () => {
    expect(liftGoalStatus(benchGoal, [])).toEqual({
      goal: benchGoal,
      achievedAt: null,
      bestE1rmKg: null,
      targetE1rmKg: 113.33,
      fraction: 0,
    });
  });

  it('is achieved by a record with at least the goal reps and load, dated by the earliest such record', () => {
    const status = liftGoalStatus(benchGoal, [
      repMax(5, 100, '2026-10-10T12:00:00Z'),
      repMax(6, 100, '2026-10-03T12:00:00Z'),
      repMax(8, 80, '2026-09-01T12:00:00Z'),
    ]);
    expect(status.achievedAt).toBe('2026-10-03T12:00:00Z');
    expect(status.fraction).toBe(1);
  });

  it('is not achieved by fewer reps at a heavier load or by the goal reps at a lighter load', () => {
    const status = liftGoalStatus(benchGoal, [
      repMax(3, 120, '2026-10-01T12:00:00Z'),
      repMax(5, 99.5, '2026-10-02T12:00:00Z'),
    ]);
    expect(status.achievedAt).toBeNull();
  });

  it('ignores records of other exercises', () => {
    expect(liftGoalStatus(benchGoal, [repMax(5, 140, '2026-10-01T12:00:00Z', SQUAT)]).achievedAt).toBeNull();
  });
});

describe('lift goal progress', () => {
  it('compares the best estimated 1RM across records with the target estimated 1RM', () => {
    const status = liftGoalStatus(benchGoal, [
      repMax(5, 90, '2026-10-01T12:00:00Z'),
      repMax(8, 80, '2026-10-01T12:00:00Z'),
    ]);
    expect(status.bestE1rmKg).toBe(102);
    expect(status.targetE1rmKg).toBe(113.33);
    expect(status.fraction).toBeCloseTo(102 / 113.33, 6);
  });

  it('caps progress at 100%', () => {
    const status = liftGoalStatus(benchGoal, [repMax(1, 130, '2026-10-01T12:00:00Z')]);
    expect(status.bestE1rmKg).toBe(130);
    expect(status.fraction).toBe(1);
  });

  it('lists active goals first, then achieved ones, each by exercise name', () => {
    const squatGoal = { ...benchGoal, exerciseId: SQUAT, exerciseName: 'Back Squat' };
    const deadliftGoal = { ...benchGoal, exerciseId: 'deadlift-id', exerciseName: 'Deadlift' };
    const statuses = liftGoalStatuses(
      [deadliftGoal, benchGoal, squatGoal],
      [repMax(5, 100, '2026-10-01T12:00:00Z', SQUAT)],
    );
    expect(statuses.map((status) => status.goal.exerciseName)).toEqual(['Bench Press', 'Deadlift', 'Back Squat']);
  });
});

describe('lift goal deadline', () => {
  it('has no deadline text without a date', () => {
    expect(deadlineText(null, '2026-10-17')).toBeNull();
  });

  it('counts the days left', () => {
    expect(deadlineText('2026-12-01', '2026-10-17')).toBe('45 days left');
    expect(deadlineText('2026-10-18', '2026-10-17')).toBe('1 day left');
    expect(deadlineText('2026-10-17', '2026-10-17')).toBe('Due today');
  });

  it('says overdue once the date has passed', () => {
    expect(deadlineText('2026-10-16', '2026-10-17')).toBe('Overdue');
  });
});

describe('lift goal text', () => {
  it('names the target in the user unit with a short date', () => {
    expect(liftGoalTargetText(benchGoal, 'kg')).toBe('100 kg × 5 by 1 Dec');
    expect(liftGoalTargetText({ ...benchGoal, targetDate: null }, 'lb')).toBe('220.5 lb × 5');
  });

  it('marks added weight on a weighted bodyweight lift', () => {
    expect(
      liftGoalTargetText({ ...benchGoal, loadType: 'bodyweight_plus', targetKg: 20, targetDate: null }, 'kg'),
    ).toBe('+20 kg × 5');
  });
});

describe('lift goal progress text', () => {
  it('compares the best estimated 1RM with the target in the user unit', () => {
    const status = liftGoalStatus(benchGoal, [repMax(5, 60, '2026-10-01T12:00:00Z')]);
    expect(liftGoalProgressText(status, 'kg')).toBe('Best e1RM 68 kg of 113.33 kg');
  });

  it('says when there is no estimate yet', () => {
    expect(liftGoalProgressText(liftGoalStatus(benchGoal, []), 'kg')).toBe('No e1RM yet for 113.33 kg');
  });
});

describe('lift goal form', () => {
  it('starts a new goal one step above the current 5 rep max', () => {
    expect(liftGoalDraft(null, [{ reps: 5, loadKg: 60, localDate: '2026-10-01' }], 'kg')).toEqual({
      weight: 62.5,
      reps: 5,
      targetDate: '',
    });
  });

  it('starts a new goal without a record at one step', () => {
    expect(liftGoalDraft(null, [], 'lb')).toEqual({ weight: 5, reps: 5, targetDate: '' });
  });

  it('round trips a goal through the form in pounds', () => {
    const goal = { ...benchGoal, targetKg: 102.06 };
    const draft = liftGoalDraft(goal, [], 'lb');
    expect(draft).toEqual({ weight: 225, reps: 5, targetDate: '2026-12-01' });
    expect(liftGoalInput(BENCH, draft, 'lb')).toEqual({
      exerciseId: BENCH,
      targetKg: 102.06,
      reps: 5,
      targetDate: '2026-12-01',
    });
  });

  it('stores an empty date as no date', () => {
    expect(liftGoalInput(BENCH, { weight: 100, reps: 3, targetDate: '' }, 'kg')).toEqual({
      exerciseId: BENCH,
      targetKg: 100,
      reps: 3,
      targetDate: null,
    });
  });
});

describe('lift goal eligibility', () => {
  it('allows weighted lifts', () => {
    expect(canHaveLiftGoal(lift({ loadType: 'external' }))).toBe(true);
    expect(canHaveLiftGoal(lift({ loadType: 'bodyweight_plus' }))).toBe(true);
  });

  it('refuses bodyweight rep lifts, holds and cardio', () => {
    expect(canHaveLiftGoal(lift({ loadType: 'bodyweight' }))).toBe(false);
    expect(canHaveLiftGoal(lift({ measure: 'time' }))).toBe(false);
    expect(canHaveLiftGoal(lift({ measure: 'distance' }))).toBe(false);
    expect(
      canHaveLiftGoal({
        id: 'run',
        name: 'Running',
        equipment: 'none',
        custom: false,
        archived: false,
        skillShares: [],
        modality: 'cardio',
        activity: {
          paceUnit: 'per_km',
          referencePaceSPerKm: null,
          maxEffort: 'max',
          tracksDistance: true,
          shares: [],
        },
      }),
    ).toBe(false);
  });
});
