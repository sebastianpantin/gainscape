import { shownWeight, unitToKg } from '../../web/src/lib/units.ts';
import { describe, expect, it } from 'vitest';
import { cardioExercise, draftOf, lift, set } from './draft-fixtures.ts';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import type { CardioExercise, Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { RecentSet } from '../../web/src/lib/history/last-session-rules.ts';
import { fatigueAdvice, nextWeightHint } from '../../web/src/lib/workout/progression-rules.ts';
import type { DraftBarbellSetup } from '../../web/src/lib/programs/program-set-rules.ts';
import {
  EXERCISE_MENU_LABELS,
  exerciseMenuChoices,
  isBarbellLift,
  liftAdvice,
  liftDetailsText,
  liftEquipment,
  removingAsksFirst,
  restStartsAfterChange,
  routineToOffer,
  warmupButtonKey,
  warmupButtonLabel,
  warmupChoiceText,
  warmupChoices,
  warmupsToOffer,
  warmupFocusAfter,
  withChosenWarmup,
} from '../../web/src/features/workout/exercise-card-rules.ts';

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

  it('names the remove choice after the whole exercise', () => {
    expect(EXERCISE_MENU_LABELS.remove).toBe('Remove exercise');
  });
});

describe('removingAsksFirst', () => {
  it('asks before removing an exercise with a logged set', () => {
    expect(removingAsksFirst(lift('a', [set('a1'), set('a2', { done: true })]))).toBe(true);
  });

  it('asks before removing planned sets, even with none logged', () => {
    const planned = set('a1', { prescription: { ref: 't1', weightKg: 100, reps: 5, minReps: null, amrap: false } });
    expect(removingAsksFirst(lift('a', [planned]))).toBe(true);
  });

  it('asks before removing sets the user added beyond the starting one, even with none logged', () => {
    expect(removingAsksFirst(lift('a', [set('a1'), set('a2')]))).toBe(true);
  });

  it('removes a card with only its untouched starting set, or no sets, straight away', () => {
    expect(removingAsksFirst(lift('a', [set('a1')]))).toBe(false);
    expect(removingAsksFirst(lift('a', []))).toBe(false);
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
    expect(restStartsAfterChange(draft, 2, set('c1'), { done: true })).toBe(true);
    expect(restStartsAfterChange(draft, 0, set('a1'), { done: true })).toBe(false);
    expect(restStartsAfterChange(draft, 1, set('b1'), { done: true })).toBe(true);
  });

  it('does not start rest for a warm-up, a weight change or an effort rating', () => {
    expect(restStartsAfterChange(draft, 2, set('c1', { isWarmup: true }), { done: true })).toBe(false);
    expect(restStartsAfterChange(draft, 2, set('c1'), { weightKg: 110 })).toBe(false);
    expect(restStartsAfterChange(draft, 2, set('c1'), { effort: { type: 'level', level: 'hard' } })).toBe(false);
  });
});

function catalogDrill(key: string): CardioExercise {
  return {
    id: key,
    key,
    name: key,
    equipment: 'bodyweight',
    custom: false,
    archived: false,
    skillShares: [],
    modality: 'cardio',
    activity: cardioExercise().activity,
  };
}

const squatRoutineOffer = (drillCount: number) => ({
  routine: { liftKey: 'back_squat', name: 'Squat routine', drillKeys: ['a', 'b', 'c', 'd'] },
  drills: Array.from({ length: drillCount }, (_, index) => catalogDrill(`drill_${index}`)),
});

describe('routineToOffer', () => {
  const squatDrillKeys = ['leg_swings', 'hip_circles', 'cossack_squat', 'squat_to_stand'];
  const catalog: Exercise[] = [
    catalogLift('squat', { key: 'back_squat' }),
    catalogLift('curl', { key: 'dumbbell_curl' }),
    catalogLift('deadlift', { key: 'deadlift' }),
    ...[...squatDrillKeys, 'cat_cow', 'inchworm', 'worlds_greatest_stretch'].map(catalogDrill),
  ];
  const drillCard = (key: string) => cardioExercise({ clientId: `card-${key}`, exerciseId: key, sets: [] });

  it('offers the Squat routine for Back Squat, with its drills in order', () => {
    const offer = routineToOffer(draftOf([lift('curl', [set('c1')]), lift('squat', [set('s1')])]), 1, catalog);
    expect(offer?.routine.name).toBe('Squat routine');
    expect(offer?.drills.map((exercise) => exercise.id)).toEqual(squatDrillKeys);
  });

  it('offers no routine for a lift without one or a lift missing from the catalog', () => {
    expect(routineToOffer(draftOf([lift('curl', [set('c1')])]), 0, catalog)).toBeNull();
    expect(routineToOffer(draftOf([lift('unknown', [set('u1')])]), 0, catalog)).toBeNull();
  });

  it('does not offer the routine again once its drills sit right above the lift', () => {
    const added = draftOf([...squatDrillKeys.map(drillCard), lift('squat', [set('s1')])]);
    expect(routineToOffer(added, 4, catalog)).toBeNull();
    const elsewhere = draftOf([...squatDrillKeys.map(drillCard), lift('curl', []), lift('squat', [set('s1')])]);
    expect(routineToOffer(elsewhere, 5, catalog)).not.toBeNull();
  });

  it('does not offer the routine while any of its drills sits in the cardio cards right above the lift', () => {
    const squat = lift('squat', [set('s1')]);
    const oneRemoved = draftOf([...squatDrillKeys.slice(1).map(drillCard), squat]);
    expect(routineToOffer(oneRemoved, 3, catalog)).toBeNull();
    const reordered = draftOf([...[...squatDrillKeys].reverse().map(drillCard), squat]);
    expect(routineToOffer(reordered, 4, catalog)).toBeNull();
    const withRunBetween = draftOf([drillCard('leg_swings'), cardioExercise(), squat]);
    expect(routineToOffer(withRunBetween, 2, catalog)).toBeNull();
  });

  it('offers a later lift its own routine when a shared drill sits above an earlier lift', () => {
    const draft = draftOf([
      ...squatDrillKeys.map(drillCard),
      lift('squat', [set('s1')]),
      lift('deadlift', [set('d1')]),
    ]);
    expect(routineToOffer(draft, 5, catalog)?.routine.name).toBe('Deadlift routine');
  });

  it('offers no routine whose drills would not fit the set limit or the 4 hours of bouts', () => {
    const manySets = Array.from({ length: MAX_SETS_PER_SESSION - 3 }, (_, index) => set(`s${index}`));
    expect(routineToOffer(draftOf([lift('squat', manySets)]), 0, catalog)).toBeNull();
    const nearlyFourHours = cardioExercise({ sets: [{ ...cardioExercise().sets[0], durationS: 14_400 - 180 }] });
    expect(routineToOffer(draftOf([nearlyFourHours, lift('squat', [set('s1')])]), 1, catalog)).toBeNull();
  });
});

describe('warmupChoices', () => {
  const offer = squatRoutineOffer(2);

  it('keeps the one-tap ramp for a lift without a routine', () => {
    expect(warmupChoices(3, null, 10)).toEqual(['ramp']);
    expect(warmupChoices(0, null, 10)).toEqual([]);
  });

  it('offers ramp sets, the routine or both for a lift with a routine', () => {
    expect(warmupChoices(3, offer, 10)).toEqual(['ramp', 'routine', 'both']);
  });

  it('offers only the routine once the ramp is added, and both only when both fit', () => {
    expect(warmupChoices(0, offer, 10)).toEqual(['routine']);
    expect(warmupChoices(3, offer, 4)).toEqual(['ramp', 'routine']);
  });
});

describe('warmupButtonLabel', () => {
  const offer = squatRoutineOffer(4);

  it('names the routine when it is the only warm-up left, otherwise says warm-ups', () => {
    expect(warmupButtonLabel(['ramp'], null)).toBe('+ Add warm-ups');
    expect(warmupButtonLabel(['ramp', 'routine', 'both'], offer)).toBe('+ Add warm-ups');
    expect(warmupButtonLabel(['routine'], offer)).toBe('+ Add Squat routine');
  });
});

describe('warmupChoiceText', () => {
  const offer = squatRoutineOffer(4);

  it('labels each choice and says what it adds', () => {
    expect(warmupChoiceText('ramp', 4, offer)).toEqual({ label: 'Ramp sets', hint: '4 loaded sets' });
    expect(warmupChoiceText('ramp', 1, offer)).toEqual({ label: 'Ramp sets', hint: '1 loaded set' });
    expect(warmupChoiceText('routine', 4, offer)).toEqual({ label: 'Squat routine', hint: '4 drills · 4 min' });
    expect(warmupChoiceText('both', 4, offer)).toEqual({ label: 'Both', hint: 'The routine, then 4 loaded sets' });
  });
});

describe('withChosenWarmup', () => {
  const draft = draftOf([lift('curl', [set('c1')]), lift('squat', [set('s1')])]);
  const ramp = [
    { weightKg: 20, reps: 10 },
    { weightKg: 60, reps: 3 },
  ];
  const offer = squatRoutineOffer(2);
  const shape = (changed: ReturnType<typeof draftOf>) =>
    changed.exercises.map((exercise) => [
      exercise.exerciseId,
      exercise.sets.map((entry) => ('kind' in entry ? 'bout' : entry.isWarmup ? 'warm-up' : 'working')).join(' '),
    ]);

  it('adds the ramp sets, the routine drills or both, with the drills above the lift', () => {
    expect(shape(withChosenWarmup(draft, 1, 'ramp', ramp, offer))).toEqual([
      ['curl', 'working'],
      ['squat', 'warm-up warm-up working'],
    ]);
    expect(shape(withChosenWarmup(draft, 1, 'routine', ramp, offer))).toEqual([
      ['curl', 'working'],
      ['drill_0', 'bout'],
      ['drill_1', 'bout'],
      ['squat', 'working'],
    ]);
    expect(shape(withChosenWarmup(draft, 1, 'both', ramp, offer))).toEqual([
      ['curl', 'working'],
      ['drill_0', 'bout'],
      ['drill_1', 'bout'],
      ['squat', 'warm-up warm-up working'],
    ]);
  });
});

describe('warmupFocusAfter', () => {
  const draft = draftOf([lift('curl', [set('c1')]), lift('squat', [set('s1')])]);
  const ramp = [{ weightKg: 20, reps: 10 }];
  const offer = squatRoutineOffer(2);

  it('focuses the first bout of the first inserted drill', () => {
    const next = withChosenWarmup(draft, 1, 'both', ramp, offer);
    const firstDrill = next.exercises[1];
    expect(warmupFocusAfter(draft, next, 1)).toEqual({ setId: firstDrill.sets[0].id, addKey: firstDrill.clientId });
  });

  it('keeps focus on the warm-up button of the lift when no drill was inserted', () => {
    expect(warmupFocusAfter(draft, withChosenWarmup(draft, 1, 'ramp', ramp, offer), 1)).toEqual({
      setId: null,
      addKey: warmupButtonKey('card-squat'),
    });
    expect(warmupButtonKey('card-squat')).not.toBe('card-squat');
  });
});
