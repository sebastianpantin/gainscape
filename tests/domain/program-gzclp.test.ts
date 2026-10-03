import { describe, expect, it } from 'vitest';
import { dayKeyOf, programStateAt, type ProgramState } from '@domain/index.ts';
import { factClock, setReferenceFact } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import { GZCLP as def, GZCLP_DEFAULT_WEIGHTS_KG, gzclpEnrollment, type GzclpLift } from './program-fixtures/gzclp.ts';
import { refOf, refsState, repsOf, slotIdsOf, slotOf, weightsOf } from './program-fixtures/prescription-helpers.ts';

const kg = gzclpEnrollment();
const startRefs = Object.fromEntries(
  Object.entries(GZCLP_DEFAULT_WEIGHTS_KG).map(([lift, weight]) => [lift, { workingWeight: weight }]),
);

function miss(lift: GzclpLift): DayLog {
  return { missedLifts: [lift] };
}

function rounds(firstDayLogs: readonly DayLog[]): DayLog[] {
  return firstDayLogs.flatMap((log) => [log, {}, {}, {}]);
}

function nextRound(state: ProgramState) {
  expect(dayKeyOf(def, state.position)).toBe('a1');
  return resolveNext(def, kg, state);
}

describe('GZCLP four-day rotation', () => {
  it.each([
    [0, 'a1', ['a1-squat-t1', 'a1-bench-t2', 'a1-pulldown-t3']],
    [1, 'b1', ['b1-ohp-t1', 'b1-deadlift-t2', 'b1-row-t3']],
    [2, 'a2', ['a2-bench-t1', 'a2-squat-t2', 'a2-pulldown-t3']],
    [3, 'b2', ['b2-deadlift-t1', 'b2-ohp-t2', 'b2-row-t3']],
    [4, 'a1', ['a1-squat-t1', 'a1-bench-t2', 'a1-pulldown-t3']],
  ])('index %d is day %s with T1, T2 and T3 slots %j', (index, day, slots) => {
    expect(dayKeyOf(def, { index })).toBe(day);
    expect(slotIdsOf(resolveAt(def, kg, refsState(startRefs), { index }))).toEqual(slots);
  });
});

describe('GZCLP stage schemes (kg)', () => {
  it('T1 stage 1 is 5×3+ @ 100 with the last set AMRAP, minReps 3', () => {
    const sets = slotOf(resolveAt(def, kg, refsState(startRefs), { index: 0 }), 'a1-squat-t1').sets;
    expect(sets.map((set) => [set.weight, set.reps])).toEqual(Array.from({ length: 5 }, () => [100, 3]));
    expect(sets.map((set) => set.amrap)).toEqual([false, false, false, false, true]);
    expect(sets[4].minReps).toBe(3);
  });

  it('T1 stage 2 is 6×2+ @ 100', () => {
    const resolved = resolveAt(def, kg, { refs: startRefs, stages: { 'squat-t1': 1 } }, { index: 0 });
    expect(weightsOf(resolved, 'a1-squat-t1')).toEqual([100, 100, 100, 100, 100, 100]);
    expect(repsOf(resolved, 'a1-squat-t1')).toEqual([2, 2, 2, 2, 2, 2]);
    expect(slotOf(resolved, 'a1-squat-t1').sets[5].amrap).toBe(true);
  });

  it('T1 stage 3 is 10×1+ @ 100', () => {
    const resolved = resolveAt(def, kg, { refs: startRefs, stages: { 'squat-t1': 2 } }, { index: 0 });
    expect(repsOf(resolved, 'a1-squat-t1')).toEqual(Array.from({ length: 10 }, () => 1));
    expect(
      slotOf(resolved, 'a1-squat-t1')
        .sets.map((set) => set.amrap)
        .lastIndexOf(true),
    ).toBe(9);
  });

  it('T2 stages are 3×10, 3×8 and 3×6 @ 50 with no AMRAP', () => {
    const stageReps = [0, 1, 2].map((stage) =>
      repsOf(resolveAt(def, kg, { refs: startRefs, stages: { 'bench-t2': stage } }, { index: 0 }), 'a1-bench-t2'),
    );
    expect(stageReps).toEqual([
      [10, 10, 10],
      [8, 8, 8],
      [6, 6, 6],
    ]);
    const sets = slotOf(resolveAt(def, kg, refsState(startRefs), { index: 0 }), 'a1-bench-t2').sets;
    expect(sets.every((set) => set.weight === 50 && !set.amrap)).toBe(true);
  });

  it('a stage belongs to its lift: squat-t1 in stage 2 leaves squat-t2 at 3×10', () => {
    const resolved = resolveAt(def, kg, { refs: startRefs, stages: { 'squat-t1': 1 } }, { index: 2 });
    expect(repsOf(resolved, 'a2-squat-t2')).toEqual([10, 10, 10]);
  });

  it('T3 is 3×15+ @ 40 with the last set AMRAP, minReps 15', () => {
    const sets = slotOf(resolveAt(def, kg, refsState(startRefs), { index: 0 }), 'a1-pulldown-t3').sets;
    expect(sets.map((set) => [set.weight, set.reps, set.amrap, set.minReps])).toEqual([
      [40, 15, false, null],
      [40, 15, false, null],
      [40, 15, true, 15],
    ]);
  });
});

describe('GZCLP T1 stage machine (kg)', () => {
  it('a met T1 at stage 1 adds 5 kg (10 lb conv.): squat 100 → 105, next a1 5×3+ @ 105', () => {
    const { state } = followProgram(def, kg, factClock(), rounds([{}]));
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBeCloseTo(105, 9);
    const resolved = nextRound(state);
    expect(weightsOf(resolved, 'a1-squat-t1')).toEqual([105, 105, 105, 105, 105]);
    expect(repsOf(resolved, 'a1-squat-t1')).toEqual([3, 3, 3, 3, 3]);
  });

  it('an upper T1 adds 2.5 kg (5 lb conv.): bench 60 → 62.5', () => {
    const { state } = followProgram(def, kg, factClock(), [{}, {}, {}]);
    expect(refOf(state, 'bench-t1', 'workingWeight')).toBeCloseTo(62.5, 9);
  });

  it('a failed T1 at stage 1 moves to 6×2+ at the same 100', () => {
    const { state } = followProgram(def, kg, factClock(), rounds([miss('squat-t1')]));
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBe(100);
    const resolved = nextRound(state);
    expect(weightsOf(resolved, 'a1-squat-t1')).toEqual([100, 100, 100, 100, 100, 100]);
    expect(repsOf(resolved, 'a1-squat-t1')).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('a second fail moves to 10×1+ at the same 100', () => {
    const { state } = followProgram(def, kg, factClock(), rounds([miss('squat-t1'), miss('squat-t1')]));
    const resolved = nextRound(state);
    expect(weightsOf(resolved, 'a1-squat-t1')).toEqual(Array.from({ length: 10 }, () => 100));
    expect(repsOf(resolved, 'a1-squat-t1')).toEqual(Array.from({ length: 10 }, () => 1));
  });

  it('a met T1 at stage 2 adds 5 kg and stays at 6×2+: 100 → 105', () => {
    const { state } = followProgram(def, kg, factClock(), rounds([miss('squat-t1'), {}]));
    const resolved = nextRound(state);
    expect(weightsOf(resolved, 'a1-squat-t1')).toEqual([105, 105, 105, 105, 105, 105]);
    expect(repsOf(resolved, 'a1-squat-t1')).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('a last-stage fail does not change the working weight by itself: squat stays 100 awaiting the 5RM retest', () => {
    const { state } = followProgram(
      def,
      kg,
      factClock(),
      rounds([miss('squat-t1'), miss('squat-t1'), miss('squat-t1')]),
    );
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBe(100);
  });

  it('a retested 5RM of 110 restarts stage 1: 5×3+ @ 92.5 (110 × 0.85 = 93.5 → 92.5)', () => {
    const clock = factClock();
    const { facts } = followProgram(def, kg, clock, rounds([miss('squat-t1'), miss('squat-t1'), miss('squat-t1')]));
    const state = programStateAt(def, kg, [...facts, setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 110)]);
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBeCloseTo(93.5, 9);
    const resolved = nextRound(state);
    expect(weightsOf(resolved, 'a1-squat-t1')).toEqual([92.5, 92.5, 92.5, 92.5, 92.5]);
    expect(repsOf(resolved, 'a1-squat-t1')).toEqual([3, 3, 3, 3, 3]);
  });

  it('after the retest restart a met session adds 5 kg from 93.5: 98.5, prescribed 97.5 (39.4 → 39)', () => {
    const clock = factClock();
    const { facts } = followProgram(def, kg, clock, rounds([miss('squat-t1'), miss('squat-t1'), miss('squat-t1')]));
    const retested = [...facts, setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 110)];
    const { state } = followProgram(def, kg, clock, rounds([{}]), retested);
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBeCloseTo(98.5, 9);
    expect(weightsOf(nextRound(state), 'a1-squat-t1')[0]).toBe(97.5);
  });

  it('a T1 fail does not touch the T2 of the same exercise: squat-t2 stays 3×10 @ 70', () => {
    const { state } = followProgram(def, kg, factClock(), [miss('squat-t1'), {}]);
    expect(dayKeyOf(def, state.position)).toBe('a2');
    const resolved = resolveNext(def, kg, state);
    expect(weightsOf(resolved, 'a2-squat-t2')).toEqual([70, 70, 70]);
    expect(repsOf(resolved, 'a2-squat-t2')).toEqual([10, 10, 10]);
  });
});

describe('GZCLP T2 stage machine (kg)', () => {
  it('a met T2 adds 2.5 kg for an upper lift: bench-t2 50 → 52.5 at 3×10', () => {
    const { state } = followProgram(def, kg, factClock(), rounds([{}]));
    expect(refOf(state, 'bench-t2', 'workingWeight')).toBeCloseTo(52.5, 9);
    expect(repsOf(nextRound(state), 'a1-bench-t2')).toEqual([10, 10, 10]);
  });

  it('fails go 3×10 → 3×8 → 3×6 at the same 50', () => {
    const once = followProgram(def, kg, factClock(), rounds([miss('bench-t2')])).state;
    expect(weightsOf(nextRound(once), 'a1-bench-t2')).toEqual([50, 50, 50]);
    expect(repsOf(nextRound(once), 'a1-bench-t2')).toEqual([8, 8, 8]);
    const twice = followProgram(def, kg, factClock(), rounds([miss('bench-t2'), miss('bench-t2')])).state;
    expect(weightsOf(nextRound(twice), 'a1-bench-t2')).toEqual([50, 50, 50]);
    expect(repsOf(nextRound(twice), 'a1-bench-t2')).toEqual([6, 6, 6]);
  });

  it('a 3×6 fail resets to stage 1 at the last stage-1 weight + 6.25 kg (15 lb conv.): 50 + 6.25 = 56.25, prescribed 57.5 (22.5 ties up)', () => {
    const fails = rounds([miss('bench-t2'), miss('bench-t2'), miss('bench-t2')]);
    const { state } = followProgram(def, kg, factClock(), fails);
    expect(refOf(state, 'bench-t2', 'workingWeight')).toBeCloseTo(56.25, 9);
    expect(weightsOf(nextRound(state), 'a1-bench-t2')).toEqual([57.5, 57.5, 57.5]);
    expect(repsOf(nextRound(state), 'a1-bench-t2')).toEqual([10, 10, 10]);
  });

  it('progress inside stage 2 does not move the reset base: 50 fail, met at 3×8 (52.5), fail, fail resets to 50 + 6.25 = 56.25', () => {
    const logs = rounds([miss('bench-t2'), {}, miss('bench-t2'), miss('bench-t2')]);
    const { state } = followProgram(def, kg, factClock(), logs);
    expect(refOf(state, 'bench-t2', 'workingWeight')).toBeCloseTo(56.25, 9);
    expect(repsOf(nextRound(state), 'a1-bench-t2')).toEqual([10, 10, 10]);
  });

  it('the reset base is the last stage-1 weight: met at 3×10 (52.5), then three fails reset to 52.5 + 6.25 = 58.75, prescribed 60', () => {
    const logs = rounds([{}, miss('bench-t2'), miss('bench-t2'), miss('bench-t2')]);
    const { state } = followProgram(def, kg, factClock(), logs);
    expect(refOf(state, 'bench-t2', 'workingWeight')).toBeCloseTo(58.75, 9);
    expect(weightsOf(nextRound(state), 'a1-bench-t2')).toEqual([60, 60, 60]);
  });
});

describe('GZCLP T3 AMRAP threshold (kg)', () => {
  it('a 25-rep AMRAP adds one rounding increment: pulldown 40 → 42.5', () => {
    const { state } = followProgram(def, kg, factClock(), [{ reps: { 'a1-pulldown-t3:2': 25 } }]);
    expect(refOf(state, 'pulldown-t3', 'workingWeight')).toBeCloseTo(42.5, 9);
  });

  it('a 24-rep AMRAP holds 40', () => {
    const { state } = followProgram(def, kg, factClock(), [{ reps: { 'a1-pulldown-t3:2': 24 } }]);
    expect(refOf(state, 'pulldown-t3', 'workingWeight')).toBe(40);
  });

  it('a 30-rep AMRAP still adds only one increment: 40 → 42.5', () => {
    const { state } = followProgram(def, kg, factClock(), [{ reps: { 'a1-pulldown-t3:2': 30 } }]);
    expect(refOf(state, 'pulldown-t3', 'workingWeight')).toBeCloseTo(42.5, 9);
  });

  it('a missed T3 holds 40 and keeps the 3×15+ scheme', () => {
    const { state } = followProgram(def, kg, factClock(), [miss('pulldown-t3'), {}]);
    expect(refOf(state, 'pulldown-t3', 'workingWeight')).toBe(40);
    expect(repsOf(resolveNext(def, kg, state), 'a2-pulldown-t3')).toEqual([15, 15, 15]);
  });

  it('the amount is the rounding setting: with a 1.25 kg increment 40 → 41.25', () => {
    const fine = gzclpEnrollment({ rounding: { increment: 1.25, mode: 'nearest', barWeight: 20 } });
    const { state } = followProgram(def, fine, factClock(), [{ reps: { 'a1-pulldown-t3:2': 25 } }]);
    expect(refOf(state, 'pulldown-t3', 'workingWeight')).toBeCloseTo(41.25, 9);
  });

  it('the shared pulldown progresses on both A days: 25 reps on a1 then on a2 gives 40 → 42.5 → 45', () => {
    const logs: DayLog[] = [{ reps: { 'a1-pulldown-t3:2': 25 } }, {}, { reps: { 'a2-pulldown-t3:2': 25 } }];
    const { state } = followProgram(def, kg, factClock(), logs);
    expect(refOf(state, 'pulldown-t3', 'workingWeight')).toBeCloseTo(45, 9);
  });
});

describe('GZCLP in lb (the sourced unit)', () => {
  const lb = gzclpEnrollment({
    unit: 'lb',
    weights: { 'squat-t1': 225, 'bench-t2': 135, 'pulldown-t3': 90 },
  });

  it('a met lower T1 adds 10 lb: squat 225 → 235', () => {
    const { state } = followProgram(def, lb, factClock(), [{}]);
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBe(235);
  });

  it('a 3×6 T2 fail resets to the last stage-1 weight + 15 lb: 135 → 150', () => {
    const fails = rounds([miss('bench-t2'), miss('bench-t2'), miss('bench-t2')]);
    const { state } = followProgram(def, lb, factClock(), fails);
    expect(refOf(state, 'bench-t2', 'workingWeight')).toBe(150);
  });

  it('a 25-rep T3 AMRAP adds one 5 lb rounding increment: 90 → 95', () => {
    const { state } = followProgram(def, lb, factClock(), [{ reps: { 'a1-pulldown-t3:2': 25 } }]);
    expect(refOf(state, 'pulldown-t3', 'workingWeight')).toBe(95);
  });

  it('a retested 5RM of 250 lb restarts at 250 × 0.85 = 212.5, prescribed 215 (42.5 ties up)', () => {
    const clock = factClock();
    const fails = rounds([miss('squat-t1'), miss('squat-t1'), miss('squat-t1')]);
    const { facts } = followProgram(def, lb, clock, fails);
    const state = programStateAt(def, lb, [...facts, setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 250)]);
    expect(dayKeyOf(def, state.position)).toBe('a1');
    expect(weightsOf(resolveNext(def, lb, state), 'a1-squat-t1')).toEqual([215, 215, 215, 215, 215]);
  });
});

describe('GZCLP lift categories', () => {
  it('declares squat and deadlift tiers lower body and bench, overhead press, pulldown and row tiers upper body', () => {
    expect(Object.fromEntries(def.lifts.map((lift) => [lift.key, lift.category]))).toEqual({
      'squat-t1': 'lower',
      'bench-t1': 'upper',
      'ohp-t1': 'upper',
      'deadlift-t1': 'lower',
      'squat-t2': 'lower',
      'bench-t2': 'upper',
      'ohp-t2': 'upper',
      'deadlift-t2': 'lower',
      'pulldown-t3': 'upper',
      'row-t3': 'upper',
    });
  });
});
