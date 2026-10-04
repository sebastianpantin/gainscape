import { describe, expect, it } from 'vitest';
import { validateEnrollment } from '@domain/index.ts';
import { factClock, jumpToFact } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import {
  JUGGERNAUT_2 as def,
  JUGGERNAUT_LIFTS,
  juggernautDay,
  juggernautEnrollment,
  type JuggernautLift,
} from './program-fixtures/juggernaut_2.ts';
import { refOf, refsState, repsOf, slotOf, weightsOf } from './program-fixtures/prescription-helpers.ts';

const kg = juggernautEnrollment();

function resolveWeek(lift: JuggernautLift, tm: number, week: number, enrollment = kg) {
  return resolveAt(def, enrollment, refsState({ [lift]: { tm } }), juggernautDay(week, lift));
}

function weeks(weekNumbers: readonly number[], logFor: (week: number, lift: JuggernautLift) => DayLog = () => ({})) {
  return weekNumbers.flatMap((week) => JUGGERNAUT_LIFTS.map((lift) => logFor(week, lift)));
}

function realization(week: number, lift: JuggernautLift, reps: number): (w: number, l: JuggernautLift) => DayLog {
  return (w, l) => (w === week && l === lift ? { reps: { [`${lift}-main:0`]: reps } } : {});
}

describe('Juggernaut 2.0 10s wave, squat TM 180 kg (book percentages of the working max)', () => {
  it('accumulation is 5×10 @ 107.5 (180 × 0.6 = 108 → 107.5) with the last set AMRAP 10+', () => {
    const sets = slotOf(resolveWeek('squat', 180, 1), 'squat-main').sets;
    expect(sets.map((set) => set.weight)).toEqual([107.5, 107.5, 107.5, 107.5, 107.5]);
    expect(sets.map((set) => set.reps)).toEqual([10, 10, 10, 10, 10]);
    expect(sets.map((set) => set.amrap)).toEqual([false, false, false, false, true]);
    expect(sets.map((set) => set.minReps)).toEqual([null, null, null, null, 10]);
  });

  it('intensification is 3×10 @ 122.5 (180 × 0.675 = 121.5 → 122.5) with no AMRAP', () => {
    const sets = slotOf(resolveWeek('squat', 180, 2), 'squat-main').sets;
    expect(sets.map((set) => [set.weight, set.reps, set.amrap])).toEqual([
      [122.5, 10, false],
      [122.5, 10, false],
      [122.5, 10, false],
    ]);
  });

  it('realization is 1×10+ @ 135 (180 × 0.75), an AMRAP with minReps 10', () => {
    const sets = slotOf(resolveWeek('squat', 180, 3), 'squat-main').sets;
    expect(sets.map((set) => [set.weight, set.reps, set.amrap, set.minReps])).toEqual([[135, 10, true, 10]]);
  });

  it('deload is 72.5/90/107.5 × 5 (180 × 0.4 = 72 → 72.5, × 0.5 = 90, × 0.6 = 108 → 107.5)', () => {
    const resolved = resolveWeek('squat', 180, 4);
    expect(weightsOf(resolved, 'squat-main')).toEqual([72.5, 90, 107.5]);
    expect(repsOf(resolved, 'squat-main')).toEqual([5, 5, 5]);
  });
});

describe('Juggernaut 2.0 every week of the 16-week cycle, squat TM 180 kg', () => {
  it.each([
    [1, 107.5, 5, 10],
    [2, 122.5, 3, 10],
    [3, 135, 1, 10],
    [5, 117.5, 5, 8],
    [6, 130, 3, 8],
    [7, 145, 1, 8],
    [9, 125, 6, 5],
    [10, 140, 4, 5],
    [11, 152.5, 1, 5],
    [13, 135, 7, 3],
    [14, 147.5, 5, 3],
    [15, 162.5, 1, 3],
  ])('week %d is %d kg for %d sets of %d', (week, weight, count, reps) => {
    const resolved = resolveWeek('squat', 180, week);
    expect(weightsOf(resolved, 'squat-main')).toEqual(Array.from({ length: count }, () => weight));
    expect(repsOf(resolved, 'squat-main')).toEqual(Array.from({ length: count }, () => reps));
  });

  it.each([4, 8, 12, 16])('week %d is the 72.5/90/107.5 × 5 deload with no AMRAP', (week) => {
    const sets = slotOf(resolveWeek('squat', 180, week), 'squat-main').sets;
    expect(sets.map((set) => [set.weight, set.reps, set.amrap])).toEqual([
      [72.5, 5, false],
      [90, 5, false],
      [107.5, 5, false],
    ]);
  });

  it.each([1, 5, 9, 13])('the accumulation of week %d ends in an AMRAP at the wave standard', (week) => {
    const sets = slotOf(resolveWeek('squat', 180, week), 'squat-main').sets;
    const last = sets[sets.length - 1];
    expect([last.amrap, last.minReps]).toEqual([true, last.reps]);
    expect(sets.slice(0, -1).every((set) => !set.amrap)).toBe(true);
  });
});

describe('Juggernaut 2.0 endOfWave: reps over the standard update the TM directly (kg)', () => {
  it('the realization AMRAP does not change the TM before the deload week ends: still 180 entering week 4', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3], realization(3, 'squat', 15)));
    expect(state.position).toEqual(juggernautDay(4, 'squat'));
    expect(refOf(state, 'squat', 'tm')).toBe(180);
  });

  it('the deload runs on the OLD TM 180 (72.5/90/107.5) after a 15-rep realization', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3], realization(3, 'squat', 15)));
    expect(weightsOf(resolveNext(def, kg, state), 'squat-main')).toEqual([72.5, 90, 107.5]);
  });

  it('15 reps in the 10s wave gives 180 + (15 − 10) × 2.5 = 192.5 once the deload week ends', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 15)));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(192.5, 9);
  });

  it('the new TM 192.5 first applies at the 8s accumulation: 5×8 @ 125 (192.5 × 0.65 = 125.125 → 125)', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 15)));
    expect(state.position).toEqual(juggernautDay(5, 'squat'));
    const resolved = resolveNext(def, kg, state);
    expect(weightsOf(resolved, 'squat-main')).toEqual([125, 125, 125, 125, 125]);
    expect(repsOf(resolved, 'squat-main')).toEqual([8, 8, 8, 8, 8]);
  });

  it('8 reps (below the standard 10) keeps the TM at 180, not 180 + (8 − 10) × 2.5 = 175', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 8)));
    expect(refOf(state, 'squat', 'tm')).toBe(180);
  });

  it('exactly the standard 10 reps leaves the TM at 180', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 10)));
    expect(refOf(state, 'squat', 'tm')).toBe(180);
  });

  it('caps at 10 reps over the standard: 25 reps gives 180 + 10 × 2.5 = 205, not 180 + 15 × 2.5 = 217.5', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 25)));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(205, 9);
  });

  it('20 reps is exactly at the cap: 180 + 10 × 2.5 = 205', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 20)));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(205, 9);
  });

  it('an upper lift uses 1.25 kg per rep: bench TM 100, 13 reps gives 100 + 3 × 1.25 = 103.75', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'bench', 13)));
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(103.75, 9);
  });

  it('only the AMRAP lift changes: squat 15 reps leaves bench, deadlift and press at their standard', () => {
    const { state } = followProgram(def, kg, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 15)));
    expect([refOf(state, 'bench', 'tm'), refOf(state, 'deadlift', 'tm'), refOf(state, 'press', 'tm')]).toEqual([
      100, 200, 60,
    ]);
  });

  it('still fires when the deload days are skipped: 15 reps then a skipped week 4 gives 192.5', () => {
    const days = [...weeks([1, 2, 3], realization(3, 'squat', 15)), ...weeks([4], () => ({ skip: true }))];
    const { state } = followProgram(def, kg, factClock(), days);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(192.5, 9);
  });

  it('a skipped realization day is neutral: squat stays 180 after the wave', () => {
    const days = weeks([1, 2, 3, 4], (week, lift) => (week === 3 && lift === 'squat' ? { skip: true } : {}));
    const { state } = followProgram(def, kg, factClock(), days);
    expect(refOf(state, 'squat', 'tm')).toBe(180);
  });

  it('reads only the realization week: a 20-rep accumulation AMRAP in week 1 with 10 reps in week 3 keeps 180', () => {
    const days = weeks([1, 2, 3, 4], (week, lift) =>
      lift === 'squat' && week === 1 ? { reps: { 'squat-main:4': 20 } } : {},
    );
    const { state } = followProgram(def, kg, factClock(), days);
    expect(refOf(state, 'squat', 'tm')).toBe(180);
  });

  it('the 8s wave uses the standard 8: TM 192.5 and 10 reps in week 7 gives 192.5 + 2 × 2.5 = 197.5', () => {
    const days = weeks([1, 2, 3, 4, 5, 6, 7, 8], (week, lift) => {
      if (lift !== 'squat') return {};
      if (week === 3) return { reps: { 'squat-main:0': 15 } };
      return week === 7 ? { reps: { 'squat-main:0': 10 } } : {};
    });
    const { state } = followProgram(def, kg, factClock(), days);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(197.5, 9);
  });

  it('the 5s wave uses the standard 5: jumping to week 9 at TM 180, 7 reps in week 11 gives 180 + 2 × 2.5 = 185', () => {
    const clock = factClock();
    const jump = [jumpToFact(clock.next(), juggernautDay(9, 'squat'))];
    const { state } = followProgram(def, kg, clock, weeks([9, 10, 11, 12], realization(11, 'squat', 7)), jump);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(185, 9);
  });

  it('the 3s wave uses the standard 3: jumping to week 13 at TM 180, 4 reps in week 15 gives 180 + (4 − 3) × 2.5 = 182.5', () => {
    const clock = factClock();
    const jump = [jumpToFact(clock.next(), juggernautDay(13, 'squat'))];
    const { state } = followProgram(def, kg, clock, weeks([13, 14, 15, 16], realization(15, 'squat', 4)), jump);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(182.5, 9);
  });
});

describe('Juggernaut 2.0 in lb (the sourced unit)', () => {
  const lb = juggernautEnrollment({ unit: 'lb', tms: { squat: 405, bench: 225, deadlift: 455, press: 135 } });
  const fine = juggernautEnrollment({
    unit: 'lb',
    tms: { squat: 405, bench: 225, deadlift: 455, press: 135 },
    options: { perRep: 'fine' },
  });

  it('bench TM 225 has a 10s realization of 170 lb (225 × 0.75 = 168.75 → 170)', () => {
    expect(weightsOf(resolveWeek('bench', 225, 3, lb), 'bench-main')).toEqual([170]);
  });

  it('bench TM 225, 10s wave in lb: 135 / 150 / 170, deload 90/115/135 (151.875 → 150, 112.5 → 115 tie up)', () => {
    expect(weightsOf(resolveWeek('bench', 225, 1, lb), 'bench-main')[0]).toBe(135);
    expect(weightsOf(resolveWeek('bench', 225, 2, lb), 'bench-main')[0]).toBe(150);
    expect(weightsOf(resolveWeek('bench', 225, 4, lb), 'bench-main')).toEqual([90, 115, 135]);
  });

  it('bench 25 reps gives 250 lb, the cap: 225 + 10 × 2.5', () => {
    const { state } = followProgram(def, lb, factClock(), weeks([1, 2, 3, 4], realization(3, 'bench', 25)));
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(250, 9);
  });

  it('bench 13 reps with the standard 2.5 lb per rep gives 225 + 3 × 2.5 = 232.5', () => {
    const { state } = followProgram(def, lb, factClock(), weeks([1, 2, 3, 4], realization(3, 'bench', 13)));
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(232.5, 9);
  });

  it('bench 13 reps with perRep fine (1.25 lb per rep) gives 225 + 3 × 1.25 = 228.75', () => {
    const { state } = followProgram(def, fine, factClock(), weeks([1, 2, 3, 4], realization(3, 'bench', 13)));
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(228.75, 9);
  });

  it('squat 13 reps with perRep fine (2.5 lb per rep) gives 405 + 3 × 2.5 = 412.5', () => {
    const { state } = followProgram(def, fine, factClock(), weeks([1, 2, 3, 4], realization(3, 'squat', 13)));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(412.5, 9);
  });

  it('book case: 405 lb and 12 reps in the 8s wave gives (12 − 8) × 5 + 405 = 425', () => {
    const clock = factClock();
    const jump = [jumpToFact(clock.next(), juggernautDay(5, 'squat'))];
    const { state } = followProgram(def, lb, clock, weeks([5, 6, 7, 8], realization(7, 'squat', 12)), jump);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(425, 9);
  });

  it('book case realization is 325 lb (405 × 0.8 = 324 → 325) and the deload after it stays on 405: 160/205/245', () => {
    const clock = factClock();
    const jump = [jumpToFact(clock.next(), juggernautDay(5, 'squat'))];
    expect(weightsOf(resolveWeek('squat', 405, 7, lb), 'squat-main')).toEqual([325]);
    const { state } = followProgram(def, lb, clock, weeks([5, 6, 7], realization(7, 'squat', 12)), jump);
    expect(weightsOf(resolveNext(def, lb, state), 'squat-main')).toEqual([160, 205, 245]);
  });
});

describe('Juggernaut 2.0 perRep fine is offered for lb enrollments only', () => {
  it('a kg enrollment cannot select fine (1.25 lb converts to 0 kg)', () => {
    const errors = validateEnrollment(def, juggernautEnrollment({ options: { perRep: 'fine' } }));
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('fine')]));
  });

  it('an lb enrollment may select fine', () => {
    expect(validateEnrollment(def, juggernautEnrollment({ unit: 'lb', options: { perRep: 'fine' } }))).toEqual([]);
  });

  it('a kg enrollment may select standard', () => {
    expect(validateEnrollment(def, juggernautEnrollment({ options: { perRep: 'standard' } }))).toEqual([]);
  });
});
