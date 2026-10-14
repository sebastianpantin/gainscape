import { shownWeight, unitToKg } from '../../web/src/lib/units.ts';
import { describe, expect, it } from 'vitest';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import type { Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { RecentSet } from '../../web/src/lib/history/last-session-rules.ts';
import { fatigueAdvice, nextWeightHint } from '../../web/src/lib/workout/progression-rules.ts';
import type { DraftBarbellSetup } from '../../web/src/lib/programs/program-set-rules.ts';
import type { DraftSet, LiftDraftExercise, WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  exerciseMenuChoices,
  isBarbellLift,
  liftAdvice,
  liftDetailsText,
  liftEquipment,
  restStartsAfterChange,
  warmupsToOffer,
} from '../../web/src/features/workout/exercise-card-rules.ts';

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

function draftOf(exercises: WorkoutDraft['exercises']): WorkoutDraft {
  return {
    sessionId: 'session',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    exercises,
  };
}

function catalogLift(id: string, overrides: Partial<Extract<Exercise, { modality: 'lift' }>> = {}): Exercise {
  return {
    id,
    name: id,
    equipment: 'barbell',
    custom: false,
    archived: false,
    skillShares: [],
    modality: 'lift',
    loadType: 'external',
    ...overrides,
  };
}

const barbell: DraftBarbellSetup = { barWeight: 20, plates: [20, 10, 5, 2.5, 1.25], barFromProgram: false };

describe('liftEquipment', () => {
  it('marks externally loaded barbell lifts as barbell lifts and flags compounds', () => {
    const equipment = liftEquipment([
      catalogLift('squat', { compound: true }),
      catalogLift('curl', { equipment: 'dumbbell' }),
      catalogLift('dip', { loadType: 'bodyweight_plus' }),
    ]);
    expect([...equipment.barbellIds]).toEqual(['squat']);
    expect([...equipment.compoundIds]).toEqual(['squat']);
    expect(isBarbellLift(lift('squat', []), equipment)).toBe(true);
    expect(isBarbellLift(lift('squat', [], { loadType: 'bodyweight_plus' }), equipment)).toBe(false);
    expect(isBarbellLift(lift('curl', []), equipment)).toBe(false);
  });

  it('leaves hold exercises out of the barbell and compound lifts', () => {
    const equipment = liftEquipment([catalogLift('plate_pinch', { compound: true, measure: 'time' })]);
    expect([...equipment.barbellIds]).toEqual([]);
    expect([...equipment.compoundIds]).toEqual([]);
  });
});

describe('exerciseMenuChoices', () => {
  it('offers to superset a lift with the next lift, to swap a lift with nothing done and to remove it', () => {
    const draft = draftOf([lift('a', [set('a1')]), lift('b', [set('b1', { done: true })])]);
    expect(exerciseMenuChoices(draft, 0)).toEqual(['superset_with_next', 'swap', 'remove']);
    expect(exerciseMenuChoices(draft, 1)).toEqual(['remove']);
  });

  it('offers ungroup inside a superset and superset with next only towards an exercise outside it', () => {
    const draft = draftOf([
      lift('a', [set('a1')], { supersetId: 'g' }),
      lift('b', [set('b1')], { supersetId: 'g' }),
      lift('c', [set('c1')]),
    ]);
    expect(exerciseMenuChoices(draft, 0)).toEqual(['ungroup', 'swap', 'remove']);
    expect(exerciseMenuChoices(draft, 1)).toEqual(['superset_with_next', 'ungroup', 'swap', 'remove']);
  });
});

describe('liftDetailsText', () => {
  it('joins the target, strength, rest and done count', () => {
    const exercise = lift('squat', [set('s1', { done: true }), set('s2')], {
      target: { sets: 3, repsMin: 5, repsMax: 8 },
    });
    expect(liftDetailsText(exercise, { e1rmKg: 120, repsCapacity: null }, 90, 'kg')).toBe(
      '3 × 5–8 · e1RM 120 kg · Rest 1:30 · 1/2 sets',
    );
  });

  it('leaves out what is unknown or switched off', () => {
    expect(liftDetailsText(lift('squat', [set('s1')]), undefined, 0, 'kg')).toBe('0/1 sets');
  });
});

describe('liftAdvice', () => {
  const recentSet = (weightKg: number, reps: number, loggedRir: number | null): RecentSet => ({
    weightKg,
    reps,
    loggedRir,
  });
  const harderEachTime = [[recentSet(100, 5, 0)], [recentSet(100, 5, 1)], [recentSet(100, 5, 2)]];

  it('gives no advice on a lift that follows a program', () => {
    const prescribed = set('s1', { prescription: { ref: 't1', weightKg: 100, reps: 5, minReps: null, amrap: false } });
    expect(liftAdvice(lift('squat', [prescribed]), harderEachTime, 'kg', barbell)).toBeNull();
  });

  it('puts fatigue advice before the next weight hint and steps by the smallest plate pair on a barbell', () => {
    const advice = liftAdvice(lift('squat', [set('s1')]), harderEachTime, 'kg', barbell);
    expect(advice).not.toBeNull();
    expect(advice).toBe(fatigueAdvice(harderEachTime, 'external', 'kg', 2.5, 20));
  });

  it('falls back to the next weight hint of the last session', () => {
    const easy = [[recentSet(100, 5, 3), recentSet(100, 5, 3)]];
    const advice = liftAdvice(lift('row', [set('r1')]), easy, 'kg', null);
    expect(advice).not.toBeNull();
    expect(advice).toBe(nextWeightHint(easy[0], 'external', null, 'kg', 2.5));
  });
});

describe('warmupsToOffer', () => {
  it('offers warm-ups in kg for a lift with a working set and no warm-ups yet', () => {
    const warmups = warmupsToOffer(lift('squat', [set('s1')]), 'kg', barbell, MAX_SETS_PER_SESSION);
    expect(warmups.length).toBeGreaterThan(1);
    expect(warmups[0]).toEqual({ weightKg: 20, reps: 10 });
  });

  it('offers a barbell lift the plate ramp from the bar', () => {
    expect(warmupsToOffer(lift('squat', [set('s1')]), 'kg', barbell, 10)).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 5 },
      { weightKg: 60, reps: 3 },
      { weightKg: 80, reps: 2 },
    ]);
  });

  it('offers a dumbbell or machine lift a ramp in load steps with no bar step', () => {
    expect(warmupsToOffer(lift('curl', [set('c1', { weightKg: 30, reps: 10 })]), 'kg', null, 10)).toEqual([
      { weightKg: 12.5, reps: 5 },
      { weightKg: 17.5, reps: 3 },
      { weightKg: 25, reps: 2 },
    ]);
  });

  it('ramps a dumbbell lift in pounds at 5 lb steps and stores the weights in kg', () => {
    const warmups = warmupsToOffer(
      lift('curl', [set('c1', { weightKg: unitToKg(50, 'lb'), reps: 10 })]),
      'lb',
      null,
      10,
    );
    expect(warmups.map(({ weightKg, reps }) => [shownWeight(weightKg, 'lb'), reps])).toEqual([
      [20, 5],
      [30, 3],
      [40, 2],
    ]);
  });

  it('offers a bodyweight lift one warm-up set at its working weight and reps', () => {
    expect(
      warmupsToOffer(
        lift('pull_up', [set('p1', { weightKg: 0, reps: 8 })], { loadType: 'bodyweight' }),
        'kg',
        null,
        10,
      ),
    ).toEqual([{ weightKg: 0, reps: 8 }]);
    expect(
      warmupsToOffer(
        lift('dip', [set('d1', { weightKg: 10, reps: 6 })], { loadType: 'bodyweight_plus' }),
        'kg',
        null,
        10,
      ),
    ).toEqual([{ weightKg: 10, reps: 6 }]);
  });

  it('offers nothing without a working set, once warm-ups exist or when they would not fit', () => {
    expect(warmupsToOffer(lift('squat', []), 'kg', barbell, 10)).toEqual([]);
    expect(warmupsToOffer(lift('squat', [set('w', { isWarmup: true }), set('s1')]), 'kg', barbell, 10)).toEqual([]);
    expect(warmupsToOffer(lift('squat', [set('s1')]), 'kg', barbell, 1)).toEqual([]);
  });
});

describe('restStartsAfterChange', () => {
  const draft = draftOf([
    lift('a', [set('a1')], { supersetId: 'g' }),
    lift('b', [set('b1')], { supersetId: 'g' }),
    lift('c', [set('c1')]),
  ]);

  it('starts rest when a set is done, but in a superset only after the round', () => {
    expect(restStartsAfterChange(draft, 2, set('c1'), { done: true }, null)).toBe(true);
    expect(restStartsAfterChange(draft, 0, set('a1'), { done: true }, null)).toBe(false);
    expect(restStartsAfterChange(draft, 1, set('b1'), { done: true }, null)).toBe(true);
  });

  it('does not start rest for a warm-up or a weight change', () => {
    expect(restStartsAfterChange(draft, 2, set('c1', { isWarmup: true }), { done: true }, null)).toBe(false);
    expect(restStartsAfterChange(draft, 2, set('c1'), { weightKg: 110 }, null)).toBe(false);
  });
});
