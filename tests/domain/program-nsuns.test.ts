import { describe, expect, it } from 'vitest';
import { initialProgramState, validateProgramDefinition } from '@domain/index.ts';
import { factClock } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import {
  NSUNS_5DAY as def,
  NSUNS_DAYS,
  nsunsDay,
  nsunsEnrollment,
  type NsunsDay,
} from './program-fixtures/nsuns_5day.ts';
import { refOf, refsState, repsOf, slotOf, weightsOf } from './program-fixtures/prescription-helpers.ts';

const kg = nsunsEnrollment();
const tms = refsState({ bench: { tm: 100 }, squat: { tm: 140 }, press: { tm: 60 }, deadlift: { tm: 200 } });

function day(name: NsunsDay) {
  return resolveAt(def, kg, tms, nsunsDay(1, name));
}

function oneWeek(logFor: Partial<Record<NsunsDay, DayLog>> = {}): DayLog[] {
  return NSUNS_DAYS.map((name) => logFor[name] ?? {});
}

function squatAmrap(reps: number): DayLog[] {
  return oneWeek({ tue: { reps: { 'tue-squat:2': reps } } });
}

describe('nSuns 5-day T1 sets (kg, % of TM)', () => {
  it('Monday bench volume at TM 100 is 65/75/85/85/85/80/75/70/65 × 8/6/4/4/4/5/6/7/8+', () => {
    const resolved = day('mon');
    expect(weightsOf(resolved, 'mon-bench')).toEqual([65, 75, 85, 85, 85, 80, 75, 70, 65]);
    expect(repsOf(resolved, 'mon-bench')).toEqual([8, 6, 4, 4, 4, 5, 6, 7, 8]);
    const sets = slotOf(resolved, 'mon-bench').sets;
    expect(sets.map((set) => set.amrap)).toEqual([false, false, false, false, false, false, false, false, true]);
    expect(sets[8].minReps).toBe(8);
  });

  it('Tuesday squat at TM 140 is 105/120/132.5/125/120/112.5/105/97.5/90 (119 → 120, 133 → 132.5, 126 → 125, 112 → 112.5, 98 → 97.5, 91 → 90)', () => {
    const resolved = day('tue');
    expect(weightsOf(resolved, 'tue-squat')).toEqual([105, 120, 132.5, 125, 120, 112.5, 105, 97.5, 90]);
    expect(repsOf(resolved, 'tue-squat')).toEqual([5, 3, 1, 3, 3, 3, 5, 5, 5]);
  });

  it('the heavy days have two AMRAPs: the 1+ set (minReps 1) and the last 5+ set (minReps 5)', () => {
    const sets = slotOf(day('tue'), 'tue-squat').sets;
    expect(sets.flatMap((set, index) => (set.amrap ? [[index, set.minReps]] : []))).toEqual([
      [2, 1],
      [8, 5],
    ]);
  });

  it('Wednesday OHP at TM 60 is 45/50/57.5/55/50/47.5/45/42.5/40 (51 → 50, 57 → 57.5, 54 → 55, 48 → 47.5, 42 → 42.5, 39 → 40)', () => {
    expect(weightsOf(day('wed'), 'wed-press')).toEqual([45, 50, 57.5, 55, 50, 47.5, 45, 42.5, 40]);
  });

  it('Thursday deadlift at TM 200 follows liftosaur: 150/170/190/180/170/160/150/140/130 × 5/3/1+/3/3/3/3/3/3+', () => {
    const resolved = day('thu');
    expect(weightsOf(resolved, 'thu-deadlift')).toEqual([150, 170, 190, 180, 170, 160, 150, 140, 130]);
    expect(repsOf(resolved, 'thu-deadlift')).toEqual([5, 3, 1, 3, 3, 3, 3, 3, 3]);
    expect(slotOf(resolved, 'thu-deadlift').sets[8].minReps).toBe(3);
  });

  it('Friday heavy bench at TM 100 is 75/85/95/90/85/80/75/70/65 × 5/3/1+/3/3/3/5/5/5+', () => {
    const resolved = day('fri');
    expect(weightsOf(resolved, 'fri-bench')).toEqual([75, 85, 95, 90, 85, 80, 75, 70, 65]);
    expect(repsOf(resolved, 'fri-bench')).toEqual([5, 3, 1, 3, 3, 3, 5, 5, 5]);
  });

  it('the TM is 90% of the 1RM: a 150 kg bench 1RM gives TM 135', () => {
    const fromOneRm = { ...kg, inputs: { ...kg.inputs, bench: { oneRm: 150 } } };
    expect(refOf(initialProgramState(def, fromOneRm), 'bench', 'tm')).toBeCloseTo(135, 9);
  });
});

describe('nSuns 5-day T2 sets read the related T1 TM (kg)', () => {
  it('Monday OHP T2 at press TM 60: 30/35/42.5 ×6 (36 → 35, 42 → 42.5) × 6/5/3/5/7/4/6/8', () => {
    const resolved = day('mon');
    expect(weightsOf(resolved, 'mon-press')).toEqual([30, 35, 42.5, 42.5, 42.5, 42.5, 42.5, 42.5]);
    expect(repsOf(resolved, 'mon-press')).toEqual([6, 5, 3, 5, 7, 4, 6, 8]);
  });

  it('Tuesday sumo deadlift T2 at deadlift TM 200: 100/120/140 ×6 × 5/5/3/5/7/4/6/8', () => {
    const resolved = day('tue');
    expect(weightsOf(resolved, 'tue-sumo-deadlift')).toEqual([100, 120, 140, 140, 140, 140, 140, 140]);
    expect(repsOf(resolved, 'tue-sumo-deadlift')).toEqual([5, 5, 3, 5, 7, 4, 6, 8]);
  });

  it('Wednesday incline T2 at bench TM 100: 40/50/60 ×6 × 6/5/3/5/7/4/6/8', () => {
    const resolved = day('wed');
    expect(weightsOf(resolved, 'wed-incline-bench')).toEqual([40, 50, 60, 60, 60, 60, 60, 60]);
    expect(repsOf(resolved, 'wed-incline-bench')).toEqual([6, 5, 3, 5, 7, 4, 6, 8]);
  });

  it('Thursday front squat T2 at squat TM 140: 50/62.5/77.5 ×6 (49 → 50, 63 → 62.5, 77 → 77.5)', () => {
    const resolved = day('thu');
    expect(weightsOf(resolved, 'thu-front-squat')).toEqual([50, 62.5, 77.5, 77.5, 77.5, 77.5, 77.5, 77.5]);
    expect(repsOf(resolved, 'thu-front-squat')).toEqual([5, 5, 3, 5, 7, 4, 6, 8]);
  });

  it('Friday close-grip bench T2 at bench TM 100: 40/50/60 ×6', () => {
    expect(weightsOf(day('fri'), 'fri-close-grip-bench')).toEqual([40, 50, 60, 60, 60, 60, 60, 60]);
  });

  it('a T2 lift needs no TM of its own: sumo deadlift has no reference and still resolves from the deadlift TM', () => {
    expect(initialProgramState(def, kg).refs['sumo-deadlift']).toBeUndefined();
    expect(weightsOf(resolveAt(def, kg, tms, nsunsDay(1, 'tue')), 'tue-sumo-deadlift')[0]).toBe(100);
  });
});

describe('nSuns 5-day AMRAP bands (kg conv.), applied at the end of the week', () => {
  it.each([
    [0, 140],
    [1, 140],
    [2, 142.5],
    [3, 142.5],
    [4, 145],
    [5, 145],
    [6, 146.25],
    [10, 146.25],
  ])('a squat 1+ AMRAP of %d reps takes TM 140 to %d', (reps, tm) => {
    const { state } = followProgram(def, kg, factClock(), squatAmrap(reps));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(tm, 9);
  });

  it('the golden: 4 reps (the 4–5 band) gives +5 kg (10 lb conv.), TM 145, so next Tuesday the 1+ set is 137.5 (137.75 → 137.5)', () => {
    const { state } = followProgram(def, kg, factClock(), squatAmrap(4));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(145, 9);
    expect(state.position).toEqual(nsunsDay(2, 'mon'));
    const tuesday = resolveAt(def, kg, state, nsunsDay(2, 'tue'));
    expect(weightsOf(tuesday, 'tue-squat')[2]).toBe(137.5);
  });

  it('the TM does not change mid-week: after Tuesday 4 reps, Thursday front squat still reads TM 140 (50/62.5/77.5)', () => {
    const { state } = followProgram(def, kg, factClock(), squatAmrap(4).slice(0, 3));
    expect(refOf(state, 'squat', 'tm')).toBe(140);
    expect(weightsOf(resolveNext(def, kg, state), 'thu-front-squat').slice(0, 3)).toEqual([50, 62.5, 77.5]);
  });

  it('the T2 follows the new TM next week: front squat at TM 145 is 50/65/80 (50.75 → 50, 65.25 → 65, 79.75 → 80)', () => {
    const { state } = followProgram(def, kg, factClock(), squatAmrap(4));
    const thursday = resolveAt(def, kg, state, nsunsDay(2, 'thu'));
    expect(weightsOf(thursday, 'thu-front-squat').slice(0, 3)).toEqual([50, 65, 80]);
  });

  it('only the 1+ set counts: a 15-rep last 5+ set with a 1-rep 1+ set gives +0', () => {
    const logs = oneWeek({ tue: { reps: { 'tue-squat:2': 1, 'tue-squat:8': 15 } } });
    const { state } = followProgram(def, kg, factClock(), logs);
    expect(refOf(state, 'squat', 'tm')).toBe(140);
  });

  it('bench progresses from Friday, not the Monday volume AMRAP: Monday 8+ for 15 with Friday 1+ for 1 gives +0', () => {
    const logs = oneWeek({ mon: { reps: { 'mon-bench:8': 15 } }, fri: { reps: { 'fri-bench:2': 1 } } });
    const { state } = followProgram(def, kg, factClock(), logs);
    expect(refOf(state, 'bench', 'tm')).toBe(100);
  });

  it('every T1 lift reads its own day: bench 2, squat 4, press 6, deadlift 3 give 102.5 / 145 / 66.25 / 202.5', () => {
    const logs = oneWeek({
      tue: { reps: { 'tue-squat:2': 4 } },
      wed: { reps: { 'wed-press:2': 6 } },
      thu: { reps: { 'thu-deadlift:2': 3 } },
      fri: { reps: { 'fri-bench:2': 2 } },
    });
    const { state } = followProgram(def, kg, factClock(), logs);
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(102.5, 9);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(145, 9);
    expect(refOf(state, 'press', 'tm')).toBeCloseTo(66.25, 9);
    expect(refOf(state, 'deadlift', 'tm')).toBeCloseTo(202.5, 9);
  });

  it('a skipped Tuesday is neutral: squat stays 140', () => {
    const { state } = followProgram(def, kg, factClock(), oneWeek({ tue: { skip: true } }));
    expect(refOf(state, 'squat', 'tm')).toBe(140);
  });
});

describe('nSuns 5-day AMRAP bands in lb (the sourced unit)', () => {
  const lb = nsunsEnrollment({ bench: 225, squat: 315, press: 135, deadlift: 405 }, 'lb');

  it.each([
    [1, 225],
    [2, 230],
    [4, 235],
    [6, 240],
  ])('a Friday bench 1+ AMRAP of %d reps takes TM 225 lb to %d', (reps, tm) => {
    const logs = oneWeek({ fri: { reps: { 'fri-bench:2': reps } } });
    const { state } = followProgram(def, lb, factClock(), logs);
    expect(refOf(state, 'bench', 'tm')).toBe(tm);
  });
});

describe('a pct load reading another lift', () => {
  it('is rejected when the lift is not declared (squat-variant)', () => {
    const broken = structuredClone(def);
    const thursday = broken.schedule.days.find((candidate) => candidate.key === 'thu');
    const scheme = thursday?.slots[1].scheme;
    if (scheme?.kind !== 'sets') throw new Error('expected the front squat set list');
    scheme.sets[0] = { reps: 5, load: { kind: 'pct', pct: 0.35, of: 'tm', lift: 'squat-variant' } };
    expect(validateProgramDefinition(broken)).toEqual(
      expect.arrayContaining([expect.stringContaining('squat-variant')]),
    );
  });
});
