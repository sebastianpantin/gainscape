import { describe, expect, it } from 'vitest';
import { dayKeyOf } from '@domain/index.ts';
import { factClock } from './program-fixtures/facts.ts';
import { asPrescribed, type DayLog, followProgram, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import { missesOf, refOf, refsState, repsOf, slotIdsOf, weightsOf } from './program-fixtures/prescription-helpers.ts';
import { STARTING_STRENGTH as def, startingStrengthEnrollment } from './program-fixtures/starting_strength.ts';

const kg = startingStrengthEnrollment();
const startRefs = refsState({
  squat: { workingWeight: 60 },
  bench: { workingWeight: 50 },
  press: { workingWeight: 35 },
  deadlift: { workingWeight: 80 },
});

function squatAfter(days: readonly DayLog[], enrollment = kg): number {
  return refOf(followProgram(def, enrollment, factClock(), days).state, 'squat', 'workingWeight');
}

describe('Starting Strength weeks (kg)', () => {
  it('week 1 is A, B, A and week 2 is B, A, B (indexes 0–5 alternate)', () => {
    expect([0, 1, 2].map((index) => dayKeyOf(def, { index }))).toEqual(['a', 'b', 'a']);
    expect([3, 4, 5].map((index) => dayKeyOf(def, { index }))).toEqual(['b', 'a', 'b']);
  });

  it('workout A is squat 3×5, bench 3×5 and deadlift 1×5 at 60 / 50 / 80', () => {
    const resolved = resolveAt(def, kg, startRefs, { index: 0 });
    expect(slotIdsOf(resolved)).toEqual(['a-squat', 'a-bench', 'a-deadlift']);
    expect(weightsOf(resolved, 'a-squat')).toEqual([60, 60, 60]);
    expect(repsOf(resolved, 'a-squat')).toEqual([5, 5, 5]);
    expect(weightsOf(resolved, 'a-bench')).toEqual([50, 50, 50]);
    expect(weightsOf(resolved, 'a-deadlift')).toEqual([80]);
    expect(repsOf(resolved, 'a-deadlift')).toEqual([5]);
  });

  it('workout B is squat 3×5, press 3×5 and deadlift 1×5', () => {
    const resolved = resolveAt(def, kg, startRefs, { index: 1 });
    expect(slotIdsOf(resolved)).toEqual(['b-squat', 'b-press', 'b-deadlift']);
    expect(weightsOf(resolved, 'b-press')).toEqual([35, 35, 35]);
    expect(repsOf(resolved, 'b-deadlift')).toEqual([5]);
  });
});

describe('Starting Strength squat opening increments (kg conv.)', () => {
  it('the first met squat session adds 5 kg (10 lb conv.): 60 → 65', () => {
    expect(squatAfter(asPrescribed(1))).toBeCloseTo(65, 9);
  });

  it('the second met squat session adds 5 kg: 65 → 70', () => {
    expect(squatAfter(asPrescribed(2))).toBeCloseTo(70, 9);
  });

  it('from the third met squat session on it adds 2.5 kg (5 lb conv.): 70 → 72.5 → 75', () => {
    expect(squatAfter(asPrescribed(3))).toBeCloseTo(72.5, 9);
    expect(squatAfter(asPrescribed(4))).toBeCloseTo(75, 9);
  });

  it('the next squat after two sessions is prescribed at 70', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(2));
    expect(weightsOf(resolveNext(def, kg, state), 'a-squat')).toEqual([70, 70, 70]);
  });

  it('a failed first squat session does not use up an opening increment: fail, met, met, met gives 60, 65, 70, 72.5', () => {
    const fail: DayLog = { missedLifts: ['squat'] };
    expect(squatAfter([fail])).toBe(60);
    expect(squatAfter([fail, {}])).toBeCloseTo(65, 9);
    expect(squatAfter([fail, {}, {}])).toBeCloseTo(70, 9);
    expect(squatAfter([fail, {}, {}, {}])).toBeCloseTo(72.5, 9);
  });

  it('only the squat opens with 5 kg: over A, B, A bench 50 → 55 (two A days), deadlift 80 → 87.5 (three days), press 35 → 37.5', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(3));
    expect(refOf(state, 'bench', 'workingWeight')).toBeCloseTo(55, 9);
    expect(refOf(state, 'deadlift', 'workingWeight')).toBeCloseTo(87.5, 9);
    expect(refOf(state, 'press', 'workingWeight')).toBeCloseTo(37.5, 9);
  });
});

describe('Starting Strength resets after two failures in a row (kg)', () => {
  const heavy = startingStrengthEnrollment({ squat: 100, deadlift: 100 });
  const failSquat: DayLog = { missedLifts: ['squat'] };
  const failDeadlift: DayLog = { missedLifts: ['deadlift'] };

  it('one failed squat session repeats 100', () => {
    const { state } = followProgram(def, heavy, factClock(), [failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBe(100);
    expect(missesOf(state, 'squat:workingWeight:afterSession')).toBe(1);
  });

  it('two failed squat sessions in a row reset 10%: 100 → 90', () => {
    const { state } = followProgram(def, heavy, factClock(), [failSquat, failSquat]);
    expect(refOf(state, 'squat', 'workingWeight')).toBeCloseTo(90, 9);
    expect(missesOf(state, 'squat:workingWeight:afterSession')).toBe(0);
  });

  it('a met session between two fails resets the count: deadlift 100 fail, met (102.5), fail keeps 102.5', () => {
    const { state } = followProgram(def, heavy, factClock(), [failDeadlift, {}, failDeadlift]);
    expect(refOf(state, 'deadlift', 'workingWeight')).toBeCloseTo(102.5, 9);
    expect(missesOf(state, 'deadlift:workingWeight:afterSession')).toBe(1);
  });

  it('then a second fail in a row resets 102.5 → 92.25, prescribed 92.5', () => {
    const { state } = followProgram(def, heavy, factClock(), [failDeadlift, {}, failDeadlift, failDeadlift]);
    expect(refOf(state, 'deadlift', 'workingWeight')).toBeCloseTo(92.25, 9);
    expect(weightsOf(resolveNext(def, heavy, state), 'a-deadlift')).toEqual([92.5]);
  });

  it('press fails only on B days: B fail, A (neutral), B fail resets 35 → 31.5', () => {
    const failPress: DayLog = { missedLifts: ['press'] };
    const { state } = followProgram(def, kg, factClock(), [{}, failPress, {}, failPress]);
    expect(refOf(state, 'press', 'workingWeight')).toBeCloseTo(31.5, 9);
  });
});

describe('Starting Strength in lb (the sourced unit)', () => {
  const lb = startingStrengthEnrollment({ squat: 135, bench: 95, press: 75, deadlift: 155 }, 'lb');

  it('squat opens +10 lb twice then +5 lb: 135 → 145 → 155 → 160', () => {
    expect(squatAfter(asPrescribed(1), lb)).toBe(145);
    expect(squatAfter(asPrescribed(2), lb)).toBe(155);
    expect(squatAfter(asPrescribed(3), lb)).toBe(160);
  });

  it('press adds 5 lb per B session: 75 → 80', () => {
    const { state } = followProgram(def, lb, factClock(), asPrescribed(2));
    expect(refOf(state, 'press', 'workingWeight')).toBe(80);
  });
});
