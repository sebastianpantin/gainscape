import { describe, expect, it } from 'vitest';
import { initialProgramState, programStateAt } from '@domain/index.ts';
import { factClock, setReferenceFact } from './program-fixtures/facts.ts';
import { asPrescribed, followProgram, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import { refOf, refsState, repsOf, weightsOf } from './program-fixtures/prescription-helpers.ts';
import { SMOLOV_JR as def, smolovJrDay, smolovJrEnrollment, type SmolovJrDay } from './program-fixtures/smolov_jr.ts';

const kg = smolovJrEnrollment(200);

function topOf(week: number, day: SmolovJrDay, oneRm = 200, enrollment = kg): number | null {
  return weightsOf(
    resolveAt(def, enrollment, refsState({ main: { tm: oneRm } }), smolovJrDay(week, day)),
    `${day}-main`,
  )[0];
}

describe('Smolov Jr schemes, 1RM 200 kg', () => {
  it.each([
    ['mon', 6, 6, 140],
    ['wed', 7, 5, 150],
    ['fri', 8, 4, 160],
    ['sat', 10, 3, 170],
  ] as const)('week 1 %s is %d×%d @ %d (70/75/80/85% of the 1RM)', (day, sets, reps, weight) => {
    const resolved = resolveAt(def, kg, refsState({ main: { tm: 200 } }), smolovJrDay(1, day));
    expect(weightsOf(resolved, `${day}-main`)).toEqual(Array.from({ length: sets }, () => weight));
    expect(repsOf(resolved, `${day}-main`)).toEqual(Array.from({ length: sets }, () => reps));
  });

  it('the 1RM input is the reference: initial state copies 200', () => {
    expect(refOf(initialProgramState(def, kg), 'main', 'tm')).toBe(200);
  });
});

describe('Smolov Jr cumulative add-ons (kg conv.), 1RM 200', () => {
  it('week 2 Monday adds 5 kg (10 lb conv.): 140 + 5 = 145', () => {
    expect(topOf(2, 'mon')).toBe(145);
  });

  it('week 3 Monday adds 8.75 kg cumulative (20 lb conv.): 140 + 8.75 = 148.75 → 150', () => {
    expect(topOf(3, 'mon')).toBe(150);
  });

  it.each([
    { day: 'wed', weight: 155, arithmetic: '150 + 5' },
    { day: 'fri', weight: 165, arithmetic: '160 + 5' },
    { day: 'sat', weight: 175, arithmetic: '170 + 5' },
  ] as const)('week 2 $day is $weight ($arithmetic)', ({ day, weight }) => {
    expect(topOf(2, day)).toBe(weight);
  });

  it.each([
    { day: 'wed', weight: 160, arithmetic: '150 + 8.75 = 158.75 → 160' },
    { day: 'fri', weight: 170, arithmetic: '160 + 8.75 = 168.75 → 170' },
    { day: 'sat', weight: 180, arithmetic: '170 + 8.75 = 178.75 → 180' },
  ] as const)('week 3 $day is $weight ($arithmetic)', ({ day, weight }) => {
    expect(topOf(3, day)).toBe(weight);
  });

  it('the add-on applies after the percentage: 1RM 150 week 2 Monday is 150 × 0.7 + 5 = 110', () => {
    expect(topOf(2, 'mon', 150)).toBe(110);
  });
});

describe('Smolov Jr in lb (the sourced unit), 1RM 300 lb', () => {
  const lb = smolovJrEnrollment(300, 'lb');

  it.each([
    [1, [210, 225, 240, 255]],
    [2, [220, 235, 250, 265]],
    [3, [230, 245, 260, 275]],
  ])('week %d Monday to Saturday is %j (+0 / +10 / +20 lb)', (week, weights) => {
    expect((['mon', 'wed', 'fri', 'sat'] as const).map((day) => topOf(week, day, 300, lb))).toEqual(weights);
  });
});

describe('Smolov Jr cycle', () => {
  it('after three weeks the next cycle starts at week 1 Monday with no add-on: 140', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(12));
    expect(state.position).toEqual(smolovJrDay(1, 'mon', 2));
    expect(weightsOf(resolveNext(def, kg, state), 'mon-main')[0]).toBe(140);
  });

  it('week 2 of the program prescribes the add-on: after week 1 the next Monday is 145', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(4));
    expect(state.position).toEqual(smolovJrDay(2, 'mon'));
    expect(weightsOf(resolveNext(def, kg, state), 'mon-main')[0]).toBe(145);
  });

  it('the 1RM never changes by itself: still 200 after the cycle', () => {
    const { state } = followProgram(def, kg, factClock(), asPrescribed(12));
    expect(refOf(state, 'main', 'tm')).toBe(200);
  });

  it('a tested 1RM of 210 entered after the cycle gives Monday 147.5 (210 × 0.7 = 147 → 147.5)', () => {
    const clock = factClock();
    const { facts } = followProgram(def, kg, clock, asPrescribed(12));
    const state = programStateAt(def, kg, [...facts, setReferenceFact(clock.next(), 'main', 'tm', 210)]);
    expect(weightsOf(resolveNext(def, kg, state), 'mon-main')[0]).toBe(147.5);
  });
});
