import { describe, expect, it } from 'vitest';
import { type Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  canHaveLiftGoal,
  deadlineText,
  earliestTargetDate,
  goalsForToday,
  goalWeightLabels,
  type GoalRepMaxRow,
  type LiftGoal,
  liftGoalDraft,
  liftGoalHint,
  liftGoalInput,
  liftGoalProgressText,
  liftGoalStatus,
  liftGoalStatuses,
  liftGoalTargetText,
  type LiftGoalRow,
  todayLocalDate,
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
  archived: false,
  trackable: true,
};

function repMax(reps: number, loadKg: number, exerciseId = BENCH): GoalRepMaxRow {
  return { exercise_id: exerciseId, reps, load_kg: loadKg };
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
      exercises: { name: 'Dip', modality: 'lift', load_type: 'bodyweight_plus', measure: 'reps', archived_at: null },
    };
    expect(toLiftGoal(row)).toEqual({
      exerciseId: BENCH,
      exerciseName: 'Dip',
      loadType: 'bodyweight_plus',
      targetKg: 102.06,
      reps: 3,
      targetDate: null,
      archived: false,
      trackable: true,
    });
  });

  it('marks archived exercises and exercises that cannot have a goal', () => {
    const exercises = {
      name: 'Plank',
      modality: 'lift',
      load_type: 'bodyweight',
      measure: 'time',
      archived_at: '2026-10-01',
    } as const;
    expect(toLiftGoal({ exercise_id: BENCH, target_kg: 10, reps: 1, target_date: null, exercises })).toMatchObject({
      archived: true,
      trackable: false,
    });
  });
});

describe('lift goal achievement', () => {
  it('is not achieved without any record', () => {
    expect(liftGoalStatus(benchGoal, [], null)).toEqual({
      goal: benchGoal,
      achieved: false,
      bestE1rmKg: null,
      targetE1rmKg: 113.33,
      fraction: 0,
    });
  });

  it('is achieved by a record with at least the goal reps and load', () => {
    const status = liftGoalStatus(benchGoal, [repMax(6, 100), repMax(8, 80)], null);
    expect(status.achieved).toBe(true);
    expect(status.fraction).toBe(1);
  });

  it('is not achieved by fewer reps at a heavier load or by the goal reps at a lighter load', () => {
    expect(liftGoalStatus(benchGoal, [repMax(3, 120), repMax(5, 99.5)], null).achieved).toBe(false);
  });

  it('ignores records of other exercises', () => {
    expect(liftGoalStatus(benchGoal, [repMax(5, 140, SQUAT)], null).achieved).toBe(false);
  });
});

describe('lift goal progress', () => {
  it('compares the best estimated 1RM across records with the target estimated 1RM', () => {
    const status = liftGoalStatus(benchGoal, [repMax(5, 90), repMax(8, 80)], null);
    expect(status.bestE1rmKg).toBe(102);
    expect(status.targetE1rmKg).toBe(113.33);
    expect(status.fraction).toBeCloseTo(102 / 113.33, 6);
  });

  it('estimates a weighted bodyweight lift on bodyweight plus added weight, like the progress chart', () => {
    const dipGoal: LiftGoal = { ...benchGoal, loadType: 'bodyweight_plus', targetKg: 20, reps: 5 };
    const status = liftGoalStatus(dipGoal, [repMax(8, 10)], 80);
    expect(status.targetE1rmKg).toBe(33.33);
    expect(status.bestE1rmKg).toBe(31);
    expect(status.fraction).toBeCloseTo(31 / 33.33, 6);
  });

  it('keeps an unachieved goal below 100% even when its estimate passes the target', () => {
    const status = liftGoalStatus(benchGoal, [repMax(2, 112)], null);
    expect(status.bestE1rmKg).toBe(115.73);
    expect(status.achieved).toBe(false);
    expect(status.fraction).toBe(0.99);
    expect(Math.round(status.fraction * 100)).toBeLessThan(100);
    expect(liftGoalHint(status, 'kg')).toBe('Hit 5 reps at 100 kg to reach it');
  });

  it('gives no hint while the estimate is below the target or once the goal is reached', () => {
    expect(liftGoalHint(liftGoalStatus(benchGoal, [repMax(5, 90)], null), 'kg')).toBeNull();
    expect(liftGoalHint(liftGoalStatus(benchGoal, [repMax(5, 100)], null), 'kg')).toBeNull();
  });

  it('lists active goals first, then achieved ones, each by exercise name', () => {
    const squatGoal = { ...benchGoal, exerciseId: SQUAT, exerciseName: 'Back Squat' };
    const deadliftGoal = { ...benchGoal, exerciseId: 'deadlift-id', exerciseName: 'Deadlift' };
    const statuses = liftGoalStatuses([deadliftGoal, benchGoal, squatGoal], [repMax(5, 100, SQUAT)], null);
    expect(statuses.map((status) => status.goal.exerciseName)).toEqual(['Bench Press', 'Deadlift', 'Back Squat']);
  });

  it('leaves goals on archived or untrackable exercises off Today', () => {
    const archived = { ...benchGoal, exerciseId: 'old', exerciseName: 'Old lift', archived: true };
    const plank = { ...benchGoal, exerciseId: 'plank', exerciseName: 'Plank', trackable: false };
    const statuses = liftGoalStatuses([archived, plank, benchGoal], [], null);
    expect(goalsForToday(statuses).map((status) => status.goal.exerciseName)).toEqual(['Bench Press']);
  });
});

describe('lift goal deadline', () => {
  it('reads today in the profile time zone', () => {
    expect(todayLocalDate(new Date('2026-10-17T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-10-18');
    expect(todayLocalDate(new Date('2026-10-17T23:30:00Z'), 'America/Los_Angeles')).toBe('2026-10-17');
  });

  it('lets a new date start today but keeps an earlier saved date valid', () => {
    expect(earliestTargetDate('', '2026-10-17')).toBe('2026-10-17');
    expect(earliestTargetDate('2026-12-01', '2026-10-17')).toBe('2026-10-17');
    expect(earliestTargetDate('2026-10-01', '2026-10-17')).toBe('2026-10-01');
  });

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
    const status = liftGoalStatus(benchGoal, [repMax(5, 60)], null);
    expect(liftGoalProgressText(status, 'kg')).toBe('Best e1RM 68 kg of 113.33 kg');
  });

  it('says when there is no estimate yet', () => {
    expect(liftGoalProgressText(liftGoalStatus(benchGoal, [], null), 'kg')).toBe('No e1RM yet for 113.33 kg');
  });
});

describe('lift goal form', () => {
  it('labels the weight like the set row', () => {
    expect(goalWeightLabels('external', 'kg')).toEqual({ label: 'Weight (kg)', accessibleName: 'Goal weight in kg' });
    expect(goalWeightLabels('bodyweight_plus', 'lb')).toEqual({
      label: 'Added weight (+lb)',
      accessibleName: 'Goal added weight in lb',
    });
  });

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

const running: Exercise = {
  id: 'run',
  name: 'Running',
  equipment: 'none',
  custom: false,
  archived: false,
  skillShares: [],
  modality: 'cardio',
  activity: { paceUnit: 'per_km', referencePaceSPerKm: null, maxEffort: 'max', tracksDistance: true, shares: [] },
};

describe('lift goal eligibility', () => {
  it('allows weighted lifts', () => {
    expect(canHaveLiftGoal(lift({ loadType: 'external' }))).toBe(true);
    expect(canHaveLiftGoal(lift({ loadType: 'bodyweight_plus' }))).toBe(true);
  });

  it('refuses bodyweight rep lifts, holds and cardio', () => {
    expect(canHaveLiftGoal(lift({ loadType: 'bodyweight' }))).toBe(false);
    expect(canHaveLiftGoal(lift({ measure: 'time' }))).toBe(false);
    expect(canHaveLiftGoal(lift({ measure: 'distance' }))).toBe(false);
    expect(canHaveLiftGoal(running)).toBe(false);
  });
});
