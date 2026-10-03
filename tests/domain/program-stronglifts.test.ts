import { describe, expect, it } from 'vitest';
import { availableDays, dayKeyOf, firstPosition, nextPosition, programStateAt, upcomingDays } from '@domain/index.ts';
import { factClock, skipDayFact } from './program-fixtures/facts.ts';
import { asPrescribed, type DayLog, followProgram, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import { missesOf, refOf, refsState, repsOf, slotIdsOf, weightsOf } from './program-fixtures/prescription-helpers.ts';
import {
  STRONGLIFTS_5X5 as def,
  STRONGLIFTS_DEFAULT_WEIGHTS_KG,
  strongLiftsEnrollment,
} from './program-fixtures/stronglifts_5x5.ts';

const kg = strongLiftsEnrollment();
const startRefs = refsState(
  Object.fromEntries(
    Object.entries(STRONGLIFTS_DEFAULT_WEIGHTS_KG).map(([lift, weight]) => [lift, { workingWeight: weight }]),
  ),
);

const failSquat: DayLog = { missedLifts: ['squat'] };

describe('StrongLifts 5x5 week (kg)', () => {
  it('workout A is squat, bench and row 5×5 at the working weights 100 / 60 / 50', () => {
    const resolved = resolveAt(def, kg, startRefs, { index: 0 });
    expect(slotIdsOf(resolved)).toEqual(['a-squat', 'a-bench', 'a-row']);
    expect(weightsOf(resolved, 'a-squat')).toEqual([100, 100, 100, 100, 100]);
    expect(weightsOf(resolved, 'a-bench')).toEqual([60, 60, 60, 60, 60]);
    expect(weightsOf(resolved, 'a-row')).toEqual([50, 50, 50, 50, 50]);
    expect(repsOf(resolved, 'a-row')).toEqual([5, 5, 5, 5, 5]);
  });

  it('workout B is squat 5×5, overhead press 5×5 and deadlift 1×5 at 100 / 40 / 120', () => {
    const resolved = resolveAt(def, kg, startRefs, { index: 1 });
    expect(slotIdsOf(resolved)).toEqual(['b-squat', 'b-press', 'b-deadlift']);
    expect(weightsOf(resolved, 'b-press')).toEqual([40, 40, 40, 40, 40]);
    expect(weightsOf(resolved, 'b-deadlift')).toEqual([120]);
    expect(repsOf(resolved, 'b-deadlift')).toEqual([5]);
  });
});

describe('StrongLifts 5x5 rotation positions', () => {
  it('starts at index 0, workout A', () => {
    expect(firstPosition(def)).toEqual({ index: 0 });
    expect(dayKeyOf(def, { index: 0 })).toBe('a');
  });

  it.each([
    [0, 'a'],
    [1, 'b'],
    [2, 'a'],
    [3, 'b'],
    [10, 'a'],
    [11, 'b'],
  ])('index %d is workout %s (A/B alternation, index mod 2)', (index, day) => {
    expect(dayKeyOf(def, { index })).toBe(day);
  });

  it('the next position after index 4 is index 5', () => {
    expect(nextPosition(def, { index: 4 })).toEqual({ index: 5 });
  });

  it('the day picker offers only the next index, not the other workout', () => {
    expect(availableDays(def, { position: { index: 6 }, completedDays: [] })).toEqual([{ index: 6 }]);
  });

  it('upcoming days are the next indexes in order', () => {
    expect(upcomingDays(def, { position: { index: 2 }, completedDays: [] }, 3)).toEqual([
      { index: 2 },
      { index: 3 },
      { index: 4 },
    ]);
  });

  it('a logged A moves the cursor to index 1, workout B', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(1));
    expect(state.position).toEqual({ index: 1 });
    expect(state.completedDays).toEqual([]);
  });

  it('a skipped index moves the cursor on without changing any weight', () => {
    const clock = factClock();
    const state = programStateAt(def, kg, [skipDayFact(clock.next(), { index: 0 })]);
    expect(state.position).toEqual({ index: 1 });
    expect(refOf(state, 'squat', 'workingWeight')).toBe(100);
  });
});

describe('StrongLifts 5x5 progression (kg)', () => {
  it('a met A adds 2.5 kg: squat 100 → 102.5, bench 60 → 62.5, row 50 → 52.5', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(1));
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(102.5, 9);
    expect(refOf(state, 'bench', 'workingWeight')).toBeCloseTo(62.5, 9);
    expect(refOf(state, 'row', 'workingWeight')).toBeCloseTo(52.5, 9);
  });

  it('a met B adds 2.5 kg to squat and press and 5 kg to deadlift: 102.5 → 105, 40 → 42.5, 120 → 125', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(2));
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(105, 9);
    expect(refOf(state, 'press', 'workingWeight')).toBeCloseTo(42.5, 9);
    expect(refOf(state, 'deadlift', 'workingWeight')).toBeCloseTo(125, 9);
  });

  it('the next A is prescribed at the new weights: squat 105, bench 62.5', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(2));
    const resolved = resolveNext(def, kg, state);
    expect(weightsOf(resolved, 'a-squat')[0]).toBe(105);
    expect(weightsOf(resolved, 'a-bench')[0]).toBe(62.5);
  });

  it('a failed session repeats the weight: one squat fail keeps 100 with one miss counted', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBe(100);
    expect(missesOf(state, 'squat:workingWeight:afterSession')).toBe(1);
  });

  it('two failed sessions in a row still repeat 100', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat, failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBe(100);
    expect(missesOf(state, 'squat:workingWeight:afterSession')).toBe(2);
  });

  it('three failed sessions in a row deload 10%: squat 100 → 90', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat, failSquat, failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(90, 9);
  });

  it('the deload restarts the failure count at 0', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat, failSquat, failSquat]);
    expect(missesOf(state, 'squat:workingWeight:afterSession')).toBe(0);
  });

  it('three more fails after a deload deload again: 90 → 81, prescribed 80 (81 / 2.5 = 32.4 → 32)', () => {
    const { state } = followProgram(
      def,
      kg,
      factClock(),
      Array.from({ length: 6 }, () => failSquat),
    );
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(81, 9);
    expect(weightsOf(resolveNext(def, kg, state), 'a-squat')[0]).toBe(80);
  });

  it('a success resets the count: fail, fail, met (102.5), fail, fail keeps 102.5', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat, failSquat, {}, failSquat, failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(102.5, 9);
    expect(missesOf(state, 'squat:workingWeight:afterSession')).toBe(2);
  });

  it('then the third fail in a row deloads 102.5 → 92.25, prescribed 92.5 (36.9 → 37)', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat, failSquat, {}, failSquat, failSquat, failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(92.25, 9);
    expect(weightsOf(resolveNext(def, kg, state), 'b-squat')[0]).toBe(92.5);
  });

  it('bench fails count on A days only: neutral B days keep the count, so the third A fail deloads 60 → 54', () => {
    const failBench: DayLog = { missedLifts: ['bench'] };
    const { state } = followProgram(def, kg, factClock(), [failBench, {}, failBench, {}, failBench]);
    expect(refOf(state, 'bench', 'workingWeight')).toBeCloseTo(54, 9);
  });

  it('a skipped session neither counts nor resets: fail, skip, fail keeps 2 misses at 100', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat, { skip: true }, failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBe(100);
    expect(missesOf(state, 'squat:workingWeight:afterSession')).toBe(2);
  });

  it('a fail on one lift does not count for another: squat fails three times while bench keeps progressing', () => {
    const { state } = followProgram(def, kg, factClock(), [failSquat, failSquat, failSquat]);
    expect(refOf(state, 'bench', 'workingWeight')).toBeCloseTo(65, 9);
    expect(missesOf(state, 'bench:workingWeight:afterSession')).toBe(0);
  });
});

describe('StrongLifts 5x5 in lb (the sourced unit)', () => {
  const lb = strongLiftsEnrollment({ squat: 135, bench: 95, row: 65, press: 65, deadlift: 95 }, 'lb');

  it('a met A then B adds 5 lb per session and 10 lb to deadlift: squat 135 → 145, deadlift 95 → 105', () => {
    const { state } = followProgram(def, lb, factClock(), asPrescribed(2));
    expect(refOf(state, 'squat', 'workingWeight')).toBe(145);
    expect(refOf(state, 'deadlift', 'workingWeight')).toBe(105);
    expect(refOf(state, 'row', 'workingWeight')).toBe(70);
  });

  it('three failed sessions in a row deload 10%: squat 200 → 180 lb', () => {
    const heavy = strongLiftsEnrollment({ squat: 200, bench: 95, row: 65, press: 65, deadlift: 95 }, 'lb');
    const { state } = followProgram(def, heavy, factClock(), [failSquat, failSquat, failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(180, 9);
  });
});
