import { describe, expect, expectTypeOf, it } from 'vitest';
import { programStateAt, type ProgramDefinition } from '@domain/index.ts';
import { type LoggedDay } from '@domain/program-progression.ts';
import { factClock, sessionFact, setReferenceFact } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, loggedAsPrescribed, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import { GZCLP, gzclpEnrollment, type GzclpLift } from './program-fixtures/gzclp.ts';
import { refOf, repsOf, weightsOf } from './program-fixtures/prescription-helpers.ts';
import { kgEnrollment, STAGED_WEEKLY, TWO_AMRAP_SLOTS } from './program-fixtures/review-fixtures.ts';

const kg = gzclpEnrollment();

function miss(lift: GzclpLift): DayLog {
  return { missedLifts: [lift] };
}

function rounds(firstDayLogs: readonly DayLog[]): DayLog[] {
  return firstDayLogs.flatMap((log) => [log, {}, {}, {}]);
}

const lastStageFail = [miss('squat-t1'), miss('squat-t1'), miss('squat-t1')];

function squatT1Sets(stage: number, refs: Parameters<typeof resolveAt>[2]['refs'], log: DayLog = {}) {
  return loggedAsPrescribed(resolveAt(GZCLP, kg, { refs, stages: { 'squat-t1': stage } }, { index: 0 }), log);
}

describe('a stages slot is judged against the sets that were prescribed (the logged snapshots)', () => {
  it('a stale client prescribed 5×3 while the state is at 6×2: five met sets are met, 100 → 105, and the stage stays 6×2', () => {
    const clock = factClock();
    const { facts, state } = followProgram(GZCLP, kg, clock, rounds([miss('squat-t1')]));
    expect(state.stages['squat-t1']).toBe(1);
    const stale = squatT1Sets(0, state.refs);
    const after = programStateAt(GZCLP, kg, [...facts, sessionFact(clock.next(), { index: 4 }, stale)]);
    expect(refOf(after, 'squat-t1', 'workingWeight')).toBeCloseTo(105, 9);
    expect(after.stages['squat-t1']).toBe(1);
    expect(after.days.at(-1)?.outcomes['squat-t1']).toBe('met');
  });

  it('a client prescribed 6×2 while the state says 5×3 needs all six: the sixth set missed is a miss, so 100 stays and the stage moves to 6×2', () => {
    const clock = factClock();
    const refs = programStateAt(GZCLP, kg, []).refs;
    const sixSets = squatT1Sets(1, refs, { reps: { 'a1-squat-t1:5': 1 } });
    const state = programStateAt(GZCLP, kg, [sessionFact(clock.next(), { index: 0 }, sixSets)]);
    expect(state.days[0].outcomes['squat-t1']).toBe('missed');
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBe(100);
    expect(state.stages['squat-t1']).toBe(1);
  });

  it('the same six sets all met while the state says 5×3 are met: 100 → 105', () => {
    const clock = factClock();
    const refs = programStateAt(GZCLP, kg, []).refs;
    const state = programStateAt(GZCLP, kg, [sessionFact(clock.next(), { index: 0 }, squatT1Sets(1, refs))]);
    expect(state.days[0].outcomes['squat-t1']).toBe('met');
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBeCloseTo(105, 9);
  });
});

describe('a scope trigger judges a stages day at the stage it had on that day', () => {
  const enrollment = kgEnrollment('enrollment-staged', { bench: { workingWeight: 100 } }, { bench: 'bench' });
  const week: DayLog[] = [{}, { missedLifts: ['bench'] }];

  it('day A met at 5×3, then a missed day B moves the stage mid-week: the end of the week still finds A met, 100 → 102.5', () => {
    const { state } = followProgram(STAGED_WEEKLY, enrollment, factClock(), week);
    expect(state.stages.bench).toBe(1);
    expect(refOf(state, 'bench', 'workingWeight')).toBeCloseTo(102.5, 9);
  });

  it('stores the stage of the day on its record: day A was at stage 1 (index 0)', () => {
    const { state } = followProgram(STAGED_WEEKLY, enrollment, factClock(), week);
    expect(state.days[0].stages).toEqual({ bench: 0 });
  });

  it('day B is recorded at the stage it was prescribed at, before its own miss moved it', () => {
    const { state } = followProgram(STAGED_WEEKLY, enrollment, factClock(), week);
    expect(state.days[1].stages).toEqual({ bench: 0 });
  });
});

describe('the retest restart reads the var the rule names (from)', () => {
  it('a set_reference on fiveRm after the last-stage fail restarts at stage 1: 5RM 110 gives 5×3+ @ 92.5', () => {
    const clock = factClock();
    const { facts } = followProgram(GZCLP, kg, clock, rounds(lastStageFail));
    const state = programStateAt(GZCLP, kg, [...facts, setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 110)]);
    expect(state.stages['squat-t1']).toBe(0);
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBeCloseTo(93.5, 9);
    expect(repsOf(resolveNext(GZCLP, kg, state), 'a1-squat-t1')).toEqual([3, 3, 3, 3, 3]);
  });

  it('a set_reference on another var (workingWeight 90) does not restart: the stage stays 6×2 at 90', () => {
    const clock = factClock();
    const { facts } = followProgram(GZCLP, kg, clock, rounds([miss('squat-t1')]));
    const state = programStateAt(GZCLP, kg, [
      ...facts,
      setReferenceFact(clock.next(), 'squat-t1', 'workingWeight', 90),
    ]);
    expect(state.stages['squat-t1']).toBe(1);
    expect(weightsOf(resolveNext(GZCLP, kg, state), 'a1-squat-t1')).toEqual([90, 90, 90, 90, 90, 90]);
  });

  describe('with the retest reading top instead of fiveRm', () => {
    const fromTop: ProgramDefinition = {
      ...structuredClone(GZCLP),
      referenceVars: ['workingWeight', 'fiveRm', 'top'],
      progression: GZCLP.progression.map((rule) =>
        rule.lift === 'squat-t1'
          ? { ...rule, onMiss: [{ kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85, from: 'top' } }] }
          : rule,
      ),
    };

    it('a set_reference on top 110 after the last-stage fail restarts squat-t1 at stage 1 at 110 × 0.85 = 93.5', () => {
      const clock = factClock();
      const { facts } = followProgram(fromTop, kg, clock, rounds(lastStageFail));
      const state = programStateAt(fromTop, kg, [...facts, setReferenceFact(clock.next(), 'squat-t1', 'top', 110)]);
      expect(state.stages['squat-t1']).toBe(0);
      expect(refOf(state, 'squat-t1', 'workingWeight')).toBeCloseTo(93.5, 9);
    });

    it('a set_reference on fiveRm after the last-stage fail no longer restarts it: stage 10×1 at 100 stays', () => {
      const clock = factClock();
      const { facts } = followProgram(fromTop, kg, clock, rounds(lastStageFail));
      const state = programStateAt(fromTop, kg, [...facts, setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 110)]);
      expect(state.stages['squat-t1']).toBe(2);
      expect(refOf(state, 'squat-t1', 'workingWeight')).toBe(100);
    });
  });
});

describe('an AMRAP adjustment reads the set of its own judged slot (full slotId:index)', () => {
  const enrollment = kgEnrollment('enrollment-two-amraps', { squat: { tm: 100 } }, { squat: 'squat' });

  function weekWith(heavyReps: number, lightReps: number) {
    return followProgram(TWO_AMRAP_SLOTS, enrollment, factClock(), [
      { reps: { 'a-heavy:0': heavyReps, 'a-light:0': lightReps } },
    ]).state;
  }

  it('heavy 4 and light 12: tm +5 from the heavy band (105), top +2.5 from the light threshold (102.5)', () => {
    const state = weekWith(4, 12);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(105, 9);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
  });

  it('heavy 2 and light 12: tm stays 100 (the light 12 is not the heavy AMRAP), top 102.5', () => {
    const state = weekWith(2, 12);
    expect(refOf(state, 'squat', 'tm')).toBe(100);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
  });

  it('heavy 12 and light 5: tm 105, top stays 100 (the heavy 12 is not the light AMRAP)', () => {
    const state = weekWith(12, 5);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(105, 9);
    expect(refOf(state, 'squat', 'top')).toBe(100);
  });
});

describe('LoggedDay', () => {
  it('requires the stages the day was judged at', () => {
    expectTypeOf<Pick<LoggedDay, 'stages'>>().toEqualTypeOf<{ stages: Readonly<Record<string, number>> }>();
  });
});
