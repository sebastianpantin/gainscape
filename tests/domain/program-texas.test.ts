import { describe, expect, it } from 'vitest';
import { initialProgramState, programStateAt, validateEnrollment } from '@domain/index.ts';
import { factClock, sessionFact } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, loggedAsPrescribed, resolveAt } from './program-fixtures/follow.ts';
import { refOf, repsOf, weightsOf } from './program-fixtures/prescription-helpers.ts';
import { TEXAS_METHOD as def, texasDay, texasEnrollment } from './program-fixtures/texas_method.ts';

const kg = texasEnrollment();

function week1(day: 'mon' | 'wed' | 'fri', enrollment = kg) {
  return resolveAt(def, enrollment, initialProgramState(def, enrollment), texasDay(1, day));
}

const missedFriday: DayLog[] = [{}, {}, { missedLifts: ['squat'] }];

describe('Texas Method week, squat 5RM 150 kg', () => {
  it('Monday is 5×5 @ 135 (150 × 0.9)', () => {
    const resolved = week1('mon');
    expect(weightsOf(resolved, 'mon-squat')).toEqual([135, 135, 135, 135, 135]);
    expect(repsOf(resolved, 'mon-squat')).toEqual([5, 5, 5, 5, 5]);
  });

  it('Wednesday is 2×5 @ 107.5, 80% of Monday (135 × 0.8 = 108 → 107.5), a cross-day reference', () => {
    const resolved = week1('wed');
    expect(weightsOf(resolved, 'wed-squat')).toEqual([107.5, 107.5]);
    expect(repsOf(resolved, 'wed-squat')).toEqual([5, 5]);
  });

  it('Friday is a new 1×5 5RM @ 152.5 (150 + 2.5 kg, 5 lb conv.)', () => {
    const resolved = week1('fri');
    expect(weightsOf(resolved, 'fri-squat')).toEqual([152.5]);
    expect(repsOf(resolved, 'fri-squat')).toEqual([5]);
  });

  it('Monday press is 5×5 @ 90 (100 × 0.9) and Friday press is 1×5 @ 102.5', () => {
    expect(weightsOf(week1('mon'), 'mon-press')).toEqual([90, 90, 90, 90, 90]);
    expect(weightsOf(week1('fri'), 'fri-press')).toEqual([102.5]);
  });

  it('Monday deadlift is 1×5 at its working weight 180', () => {
    const resolved = week1('mon');
    expect(weightsOf(resolved, 'mon-deadlift')).toEqual([180]);
    expect(repsOf(resolved, 'mon-deadlift')).toEqual([5]);
  });
});

describe('Texas Method weekly progression (kg)', () => {
  it('a met Friday raises the 5RM to 152.5, so the next Monday is 137.5 (152.5 × 0.9 = 137.25 → 137.5)', () => {
    const { state } = followProgram(def, kg, factClock(), [{}, {}, {}]);
    expect(refOf(state, 'squat', 'fiveRm')).toBeCloseTo(152.5, 9);
    expect(state.position).toEqual(texasDay(2, 'mon'));
    expect(weightsOf(resolveAt(def, kg, state, texasDay(2, 'mon')), 'mon-squat')[0]).toBe(137.5);
  });

  it('the cross-day reference reads the current week: week 2 Wednesday is 0.8 × 137.5 = 110', () => {
    const { state } = followProgram(def, kg, factClock(), [{}, {}, {}]);
    expect(weightsOf(resolveAt(def, kg, state, texasDay(2, 'wed')), 'wed-squat')).toEqual([110, 110]);
  });

  it('week 2 Friday is the next 5RM attempt: 152.5 + 2.5 = 155', () => {
    const { state } = followProgram(def, kg, factClock(), [{}, {}, {}]);
    expect(weightsOf(resolveAt(def, kg, state, texasDay(2, 'fri')), 'fri-squat')).toEqual([155]);
  });

  it('a met Friday press raises the press 5RM 100 → 102.5', () => {
    const { state } = followProgram(def, kg, factClock(), [{}, {}, {}]);
    expect(refOf(state, 'press', 'fiveRm')).toBeCloseTo(102.5, 9);
  });

  it('the 5RM does not change before the week ends: after Monday and Wednesday it is still 150', () => {
    const { state } = followProgram(def, kg, factClock(), [{}, {}]);
    expect(refOf(state, 'squat', 'fiveRm')).toBe(150);
  });

  it('a missed Friday keeps the 5RM at 150 and the next Monday at 135', () => {
    const { state } = followProgram(def, kg, factClock(), missedFriday);
    expect(refOf(state, 'squat', 'fiveRm')).toBe(150);
    expect(weightsOf(resolveAt(def, kg, state, texasDay(2, 'mon')), 'mon-squat')[0]).toBe(135);
  });

  it('there is no automatic reset: three missed Fridays in a row still keep 150', () => {
    const { state } = followProgram(def, kg, factClock(), [...missedFriday, ...missedFriday, ...missedFriday]);
    expect(refOf(state, 'squat', 'fiveRm')).toBe(150);
  });

  it('a missed Monday does not hold the Friday increase: Monday missed, Friday met gives 152.5', () => {
    const { state } = followProgram(def, kg, factClock(), [{ missedLifts: ['squat'] }, {}, {}]);
    expect(refOf(state, 'squat', 'fiveRm')).toBeCloseTo(152.5, 9);
  });

  it('the deadlift working weight has no automatic progression: still 180 after a week', () => {
    const { state } = followProgram(def, kg, factClock(), [{}, {}, {}]);
    expect(refOf(state, 'deadlift', 'workingWeight')).toBe(180);
  });
});

describe('Texas Method Wednesday reads the ROUNDED Monday, squat 5RM 130 kg', () => {
  const enrollment = texasEnrollment({ squat: 130 });

  it('Monday is 117.5 (130 × 0.9 = 117 rounds up to 117.5)', () => {
    expect(weightsOf(week1('mon', enrollment), 'mon-squat')[0]).toBe(117.5);
  });

  it('Wednesday is 95: 0.8 × the rounded 117.5 = 94 → 95, not 0.8 × 117 = 93.6 → 92.5', () => {
    expect(weightsOf(week1('wed', enrollment), 'wed-squat')).toEqual([95, 95]);
  });

  it('doing Wednesday before Monday gives the same 95 and leaves Monday at 117.5', () => {
    const clock = factClock();
    const start = initialProgramState(def, enrollment);
    const wednesday = resolveAt(def, enrollment, start, texasDay(1, 'wed'));
    expect(weightsOf(wednesday, 'wed-squat')).toEqual([95, 95]);
    const facts = [sessionFact(clock.next(), texasDay(1, 'wed'), loggedAsPrescribed(wednesday))];
    const state = programStateAt(def, enrollment, facts);
    expect(state.completedDays).toEqual(['wed']);
    expect(weightsOf(resolveAt(def, enrollment, state, texasDay(1, 'mon')), 'mon-squat')[0]).toBe(117.5);
  });
});

describe('Texas Method in lb (the sourced unit), squat 5RM 300 lb', () => {
  const lb = texasEnrollment({ unit: 'lb', squat: 300, press: 200, deadlift: 365 });

  it('Monday 270, Wednesday 215 (270 × 0.8 = 216 → 215), Friday 305', () => {
    expect(weightsOf(week1('mon', lb), 'mon-squat')[0]).toBe(270);
    expect(weightsOf(week1('wed', lb), 'wed-squat')).toEqual([215, 215]);
    expect(weightsOf(week1('fri', lb), 'fri-squat')).toEqual([305]);
  });

  it('a met Friday adds 5 lb: 300 → 305, next Monday 275 (274.5 → 275)', () => {
    const { state } = followProgram(def, lb, factClock(), [{}, {}, {}]);
    expect(refOf(state, 'squat', 'fiveRm')).toBe(305);
    expect(weightsOf(resolveAt(def, lb, state, texasDay(2, 'mon')), 'mon-squat')[0]).toBe(275);
  });
});

describe('Texas Method pressLift option', () => {
  it.each(['bench', 'ohp'])('accepts %s', (pressLift) => {
    expect(validateEnrollment(def, texasEnrollment({ options: { pressLift } }))).toEqual([]);
  });

  it('rejects a press the source does not name (incline)', () => {
    const errors = validateEnrollment(def, texasEnrollment({ options: { pressLift: 'incline' } }));
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('pressLift')]));
  });
});
