import { describe, expect, it } from 'vitest';
import {
  programStateAt,
  type ProgramDefinition,
  type ProgramState,
  recomputeRelativeSets,
  type ReferenceChange,
  type SlotDecl,
} from '@domain/index.ts';
import { factClock, setReferenceFact } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, resolveAt } from './program-fixtures/follow.ts';
import { GZCLP, gzclpEnrollment, type GzclpLift } from './program-fixtures/gzclp.ts';
import { JUGGERNAUT_2, JUGGERNAUT_LIFTS, juggernautEnrollment } from './program-fixtures/juggernaut_2.ts';
import { NSUNS_5DAY, nsunsEnrollment } from './program-fixtures/nsuns_5day.ts';
import { refOf, refsState, repsOf, weightsOf } from './program-fixtures/prescription-helpers.ts';
import { RPE_TOP_SET, rpeDay, rpeEnrollment } from './program-fixtures/rpe_top_set.ts';
import { STRONGLIFTS_5X5, strongLiftsEnrollment } from './program-fixtures/stronglifts_5x5.ts';

function lastChange(state: ProgramState, lift: string): Pick<ReferenceChange, 'var' | 'to' | 'reason'> | undefined {
  const change = state.history.filter((entry) => entry.lift === lift).at(-1);
  return change && { var: change.var, to: change.to, reason: change.reason };
}

function miss(lift: GzclpLift): DayLog {
  return { missedLifts: [lift] };
}

function rounds(firstDayLogs: readonly DayLog[]): DayLog[] {
  return firstDayLogs.flatMap((log) => [log, {}, {}, {}]);
}

describe('history reasons of the 1b adjustments', () => {
  it("a failureCounter deload is an 'adjustment': StrongLifts squat 100 → 90", () => {
    const failSquat: DayLog = { missedLifts: ['squat'] };
    const { state } = followProgram(STRONGLIFTS_5X5, strongLiftsEnrollment(), factClock(), [
      failSquat,
      failSquat,
      failSquat,
    ]);
    expect(lastChange(state, 'squat')).toEqual({
      var: 'workingWeight',
      to: expect.closeTo(90, 9),
      reason: 'adjustment',
    });
  });

  it("a stage reset is an 'adjustment': GZCLP bench-t2 50 → 56.25", () => {
    const fails = rounds([miss('bench-t2'), miss('bench-t2'), miss('bench-t2')]);
    const { state } = followProgram(GZCLP, gzclpEnrollment(), factClock(), fails);
    expect(lastChange(state, 'bench-t2')).toEqual({
      var: 'workingWeight',
      to: expect.closeTo(56.25, 9),
      reason: 'adjustment',
    });
  });

  it("a retest restart is a set_reference on fiveRm followed by an 'adjustment' of the working weight to 93.5", () => {
    const clock = factClock();
    const enrollment = gzclpEnrollment();
    const { facts } = followProgram(GZCLP, enrollment, clock, rounds([miss('squat-t1')]));
    const state = programStateAt(GZCLP, enrollment, [
      ...facts,
      setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 110),
    ]);
    const changes = state.history.filter((entry) => entry.lift === 'squat-t1').slice(-2);
    expect(changes.map((entry) => [entry.var, entry.reason])).toEqual([
      ['fiveRm', 'set_reference'],
      ['workingWeight', 'adjustment'],
    ]);
  });

  it("an e1RM update is an 'adjustment': 175 × 3 @ 8 → 202.78", () => {
    const log: DayLog = { weightsKg: { 'squat-top:0': 175 }, efforts: { 'squat-top:0': { type: 'rpe', value: 8 } } };
    const { state } = followProgram(RPE_TOP_SET, rpeEnrollment(), factClock(), [log]);
    expect(lastChange(state, 'squat')).toEqual({ var: 'e1rm', to: expect.closeTo(202.78, 2), reason: 'adjustment' });
  });

  it("an amrapTable band is an 'increment': nSuns squat 4 reps 140 → 145", () => {
    const week: DayLog[] = [{}, { reps: { 'tue-squat:2': 4 } }, {}, {}, {}];
    const { state } = followProgram(NSUNS_5DAY, nsunsEnrollment(), factClock(), week);
    expect(lastChange(state, 'squat')).toEqual({ var: 'tm', to: expect.closeTo(145, 9), reason: 'increment' });
  });

  it("repsOverStandard is an 'increment': Juggernaut squat 15 reps 180 → 192.5", () => {
    const days = [1, 2, 3, 4].flatMap((week) =>
      JUGGERNAUT_LIFTS.map((lift): DayLog => (week === 3 && lift === 'squat' ? { reps: { 'squat-main:0': 15 } } : {})),
    );
    const { state } = followProgram(JUGGERNAUT_2, juggernautEnrollment(), factClock(), days);
    expect(lastChange(state, 'squat')).toEqual({ var: 'tm', to: expect.closeTo(192.5, 9), reason: 'increment' });
  });

  it("amrapThreshold is an 'increment': GZCLP pulldown 25 reps 40 → 42.5", () => {
    const { state } = followProgram(GZCLP, gzclpEnrollment(), factClock(), [{ reps: { 'a1-pulldown-t3:2': 25 } }]);
    expect(lastChange(state, 'pulldown-t3')).toEqual({
      var: 'workingWeight',
      to: expect.closeTo(42.5, 9),
      reason: 'increment',
    });
  });
});

describe('a stage reset with no recorded stage-1 weight falls back to the current weight', () => {
  const singleStage: ProgramDefinition = structuredClone(GZCLP);
  const benchT2 = singleStage.schedule.days[0].slots.find((slot) => slot.id === 'a1-bench-t2');
  if (benchT2?.scheme.kind === 'stages') benchT2.scheme.stages = [{ sets: 3, reps: 10, amrapLast: false }];

  it('a one-stage T2 fail resets at once to the current 50 + 6.25 = 56.25 and stays at 3×10', () => {
    const enrollment = gzclpEnrollment();
    const { state } = followProgram(singleStage, enrollment, factClock(), rounds([miss('bench-t2')]));
    expect(refOf(state, 'bench-t2', 'workingWeight')).toBeCloseTo(56.25, 9);
    expect(repsOf(resolveAt(singleStage, enrollment, state, state.position), 'a1-bench-t2')).toEqual([10, 10, 10]);
  });
});

describe('recomputeRelativeSets beyond direct back-offs', () => {
  const extraSlots: SlotDecl[] = [
    {
      id: 'squat-down',
      lift: 'squat',
      role: 'supplemental',
      scheme: {
        kind: 'repeat',
        count: 2,
        reps: 3,
        load: { kind: 'pctOfSet', ref: 'squat-fatigue:0', pct: 0.9 },
      },
    },
    {
      id: 'squat-same',
      lift: 'squat',
      role: 'supplemental',
      scheme: { kind: 'sets', sets: [{ reps: 3, load: { kind: 'sameAs', ref: 'squat-top:0' } }] },
    },
  ];
  const chained: ProgramDefinition = structuredClone(RPE_TOP_SET);
  chained.schedule.days[0].slots.push(...structuredClone(extraSlots));
  const enrollment = rpeEnrollment();
  const position = rpeDay(1, 'squat');
  const resolved = resolveAt(chained, enrollment, refsState({ squat: { e1rm: 200 } }), position);

  it('resolves the chain before any edit: top 172.5, back-offs 165, down sets 165 × 0.9 = 148.5 → 147.5, same 172.5', () => {
    expect(weightsOf(resolved, 'squat-down')).toEqual([147.5, 147.5]);
    expect(weightsOf(resolved, 'squat-same')).toEqual([172.5]);
  });

  it('a back-off of a back-off moves: top 180 → back-offs 170 → down sets 170 × 0.9 = 153 → 152.5', () => {
    const recomputed = recomputeRelativeSets(chained, enrollment, position, resolved, { 'squat-top:0': 180 });
    expect(weightsOf(recomputed, 'squat-down')).toEqual([152.5, 152.5]);
  });

  it('a sameAs set of the edited top moves with it: 172.5 → 180', () => {
    const recomputed = recomputeRelativeSets(chained, enrollment, position, resolved, { 'squat-top:0': 180 });
    expect(weightsOf(recomputed, 'squat-same')).toEqual([180]);
  });

  it('a reference to a set that is not in the given slots stays unmoved: down sets alone keep 147.5', () => {
    const downOnly = resolved.filter((slot) => slot.slotId === 'squat-down');
    const recomputed = recomputeRelativeSets(chained, enrollment, position, downOnly, { 'squat-top:0': 180 });
    expect(weightsOf(recomputed, 'squat-down')).toEqual([147.5, 147.5]);
  });
});
