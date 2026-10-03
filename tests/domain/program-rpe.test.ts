import { describe, expect, it } from 'vitest';
import { initialProgramState, programStateAt, recomputeRelativeSets, type ResolvedSlot } from '@domain/index.ts';
import { factClock, loggedSet, sessionFact } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, type LoggedEffort, resolveAt } from './program-fixtures/follow.ts';
import {
  refOf,
  refsState,
  repsOf,
  slotIdsOf,
  slotOf,
  weightsKgOf,
  weightsOf,
} from './program-fixtures/prescription-helpers.ts';
import { RPE_TOP_SET as def, rpeDay, rpeEnrollment } from './program-fixtures/rpe_top_set.ts';

const fatigue = rpeEnrollment();
const fixed = rpeEnrollment({ options: { backoff: 'fixed' } });

function squatDay(enrollment = fatigue, e1rm = 200): ResolvedSlot[] {
  return resolveAt(def, enrollment, refsState({ squat: { e1rm } }), rpeDay(1, 'squat'));
}

function topSet(weightKg: number, reps: number, effort: LoggedEffort | null): DayLog {
  return {
    weightsKg: { 'squat-top:0': weightKg },
    reps: { 'squat-top:0': reps },
    efforts: effort ? { 'squat-top:0': effort } : {},
  };
}

function squatE1rmAfter(log: DayLog, enrollment = fatigue): number {
  return refOf(followProgram(def, enrollment, factClock(), [log]).state, 'squat', 'e1rm');
}

describe('RPE top set (kg), e1RM 200', () => {
  it('the top set is 3 @ RPE 8 = 86.3% of the e1RM: 200 × 0.863 = 172.6 → 172.5', () => {
    const resolved = squatDay();
    expect(weightsOf(resolved, 'squat-top')).toEqual([172.5]);
    expect(repsOf(resolved, 'squat-top')).toEqual([3]);
    expect(slotOf(resolved, 'squat-top').sets[0].pct).toBeCloseTo(0.863, 10);
  });

  it('the fatigue drop prescribes five optional back-offs × 3 @ 165 (172.5 × 0.95 = 163.875 → 165)', () => {
    const sets = slotOf(squatDay(), 'squat-fatigue').sets;
    expect(sets.map((set) => [set.weight, set.reps, set.optional])).toEqual(
      Array.from({ length: 5 }, () => [165, 3, true]),
    );
  });

  it('the fatigue variant has no fixed back-offs', () => {
    expect(slotIdsOf(squatDay())).toEqual(['squat-top', 'squat-fatigue']);
  });

  it('the fixed variant prescribes 3 required × 3 @ 160 (172.5 × 0.925 = 159.5625 → 160)', () => {
    const resolved = squatDay(fixed);
    expect(slotIdsOf(resolved)).toEqual(['squat-top', 'squat-fixed']);
    const sets = slotOf(resolved, 'squat-fixed').sets;
    expect(sets.map((set) => [set.weight, set.reps, set.optional])).toEqual([
      [160, 3, false],
      [160, 3, false],
      [160, 3, false],
    ]);
  });

  it('the fixed drop is an option: 10% gives 172.5 × 0.9 = 155.25 → 155', () => {
    const tenPercent = rpeEnrollment({ options: { backoff: 'fixed', fixedBackoffPct: 0.9 } });
    expect(weightsOf(squatDay(tenPercent), 'squat-fixed')).toEqual([155, 155, 155]);
  });

  it('back-offs resolve from the ROUNDED top: e1RM 190 gives a top of 163.97 → 165 and back-offs 156.75 → 157.5, not 155.77 → 155', () => {
    const resolved = squatDay(fatigue, 190);
    expect(weightsOf(resolved, 'squat-top')).toEqual([165]);
    expect(weightsOf(resolved, 'squat-fatigue')[0]).toBe(157.5);
  });

  it('back-off sets carry snapshots at their weight', () => {
    const sets = slotOf(squatDay(fixed), 'squat-fixed').sets;
    expect(sets.map((set) => set.snapshot?.weightKg)).toEqual([160, 160, 160]);
  });
});

describe('RPE e1RM update from linked top sets', () => {
  it('a logged 175 × 3 @ RPE 8 updates the e1RM to 175 / 0.863 = 202.78', () => {
    expect(squatE1rmAfter(topSet(175, 3, { type: 'rpe', value: 8 }))).toBeCloseTo(202.78, 2);
  });

  it('so the next top is 175 (202.78 × 0.863 = 175.0)', () => {
    const { state } = followProgram(def, fatigue, factClock(), [topSet(175, 3, { type: 'rpe', value: 8 })]);
    expect(weightsOf(resolveAt(def, fatigue, state, rpeDay(2, 'squat')), 'squat-top')).toEqual([175]);
  });

  it('the same set logged as RIR 2 (RPE 10 − 2 = 8) gives the same 202.78', () => {
    expect(squatE1rmAfter(topSet(175, 3, { type: 'rir', value: 2 }))).toBeCloseTo(202.78, 2);
  });

  it('the same set logged as a level changes nothing, even though a level stores an RIR-like value 2', () => {
    expect(squatE1rmAfter(topSet(175, 3, { type: 'level', value: 2 }))).toBe(200);
  });

  it('the same set with no effort changes nothing', () => {
    expect(squatE1rmAfter(topSet(175, 3, null))).toBe(200);
  });

  it('175 × 3 @ RIR 4 (RPE 6, off the chart) changes nothing', () => {
    expect(squatE1rmAfter(topSet(175, 3, { type: 'rir', value: 4 }))).toBe(200);
  });

  it('175 × 3 @ RPE 6.5 (below the chart) changes nothing', () => {
    expect(squatE1rmAfter(topSet(175, 3, { type: 'rpe', value: 6.5 }))).toBe(200);
  });

  it('175 × 7 @ RPE 8 (more than 6 reps, off the chart) changes nothing and does not extrapolate', () => {
    expect(squatE1rmAfter(topSet(175, 7, { type: 'rpe', value: 8 }))).toBe(200);
  });

  it('a half-step RPE reads the chart: 175 × 3 @ 8.5 gives 175 / 0.878 = 199.32', () => {
    expect(squatE1rmAfter(topSet(175, 3, { type: 'rpe', value: 8.5 }))).toBeCloseTo(199.32, 2);
  });

  it('RPE 10 reads the chart: 175 × 3 @ 10 gives 175 / 0.922 = 189.80', () => {
    expect(squatE1rmAfter(topSet(175, 3, { type: 'rpe', value: 10 }))).toBeCloseTo(189.8, 2);
  });

  it('reads the logged reps, not the prescribed ones: 175 × 2 @ 9 gives 175 / 0.922 = 189.80 although the set missed', () => {
    expect(squatE1rmAfter(topSet(175, 2, { type: 'rpe', value: 9 }))).toBeCloseTo(189.8, 2);
  });

  it('a heavier top 180 × 4 @ 8 gives 180 / 0.837 = 215.05', () => {
    expect(squatE1rmAfter(topSet(180, 4, { type: 'rpe', value: 8 }))).toBeCloseTo(215.05, 2);
  });

  it('back-off sets never update it: top with no effort and back-offs at 165 × 3 @ RPE 10 keep 200', () => {
    const backoffEfforts = Object.fromEntries(
      [0, 1, 2, 3, 4].map((index) => [`squat-fatigue:${index}`, { type: 'rpe' as const, value: 10 }]),
    );
    expect(squatE1rmAfter({ efforts: backoffEfforts })).toBe(200);
  });

  it('an unlinked set with an RPE (no prescription snapshot) never updates it', () => {
    const clock = factClock();
    const unlinked = {
      ...loggedSet('squat', { weightKg: 175, reps: 3 }, null),
      effortInputType: 'rpe' as const,
      effortValue: 8,
    };
    const state = programStateAt(def, fatigue, [sessionFact(clock.next(), rpeDay(1, 'squat'), [unlinked])]);
    expect(refOf(state, 'squat', 'e1rm')).toBe(200);
  });

  it('two sessions chain: 175 × 3 @ 8 (202.78) then 180 × 3 @ 8 gives 180 / 0.863 = 208.57', () => {
    const logs: DayLog[] = [
      topSet(175, 3, { type: 'rpe', value: 8 }),
      {},
      {},
      topSet(180, 3, { type: 'rpe', value: 8 }),
    ];
    const { state } = followProgram(def, fatigue, factClock(), logs);
    expect(refOf(state, 'squat', 'e1rm')).toBeCloseTo(208.57, 2);
  });

  it('only the logged lift changes: bench keeps its e1RM 120', () => {
    const { state } = followProgram(def, fatigue, factClock(), [topSet(175, 3, { type: 'rpe', value: 8 })]);
    expect(refOf(state, 'bench', 'e1rm')).toBe(120);
  });

  it('the e1RM input is the initial reference', () => {
    expect(refOf(initialProgramState(def, fatigue), 'squat', 'e1rm')).toBe(200);
  });
});

describe('RPE top set in lb, e1RM 450 lb', () => {
  const lb = rpeEnrollment({ unit: 'lb', e1rms: { squat: 450 } });
  const lbFixed = rpeEnrollment({ unit: 'lb', e1rms: { squat: 450 }, options: { backoff: 'fixed' } });

  it('the top is 450 × 0.863 = 388.35 → 390 lb, emitted as 176.9 kg', () => {
    const resolved = squatDay(lb, 450);
    expect(weightsOf(resolved, 'squat-top')).toEqual([390]);
    expect(weightsKgOf(resolved, 'squat-top')).toEqual([176.9]);
  });

  it('fatigue back-offs are 390 × 0.95 = 370.5 → 370 lb, fixed are 390 × 0.925 = 360.75 → 360 lb', () => {
    expect(weightsOf(squatDay(lb, 450), 'squat-fatigue')[0]).toBe(370);
    expect(weightsOf(squatDay(lbFixed, 450), 'squat-fixed')[0]).toBe(360);
  });

  it('a logged 174.63 kg (384.99 lb) × 3 @ 8 updates the e1RM in lb to 384.99 / 0.863 = 446.11', () => {
    const weightKg = 174.63;
    const { state } = followProgram(def, lb, factClock(), [topSet(weightKg, 3, { type: 'rpe', value: 8 })]);
    expect(refOf(state, 'squat', 'e1rm')).toBeCloseTo(446.11, 1);
  });
});

describe('recomputeRelativeSets moves back-offs when the top weight is edited', () => {
  it('a fatigue top edited from 172.5 to 180 moves the back-offs to 180 × 0.95 = 171 → 170', () => {
    const resolved = squatDay();
    const recomputed = recomputeRelativeSets(def, fatigue, rpeDay(1, 'squat'), resolved, { 'squat-top:0': 180 });
    expect(weightsOf(recomputed, 'squat-fatigue')).toEqual([170, 170, 170, 170, 170]);
    expect(weightsKgOf(recomputed, 'squat-fatigue')).toEqual([170, 170, 170, 170, 170]);
  });

  it('a fixed top edited to 180 moves the back-offs to 180 × 0.925 = 166.5 → 167.5', () => {
    const resolved = squatDay(fixed);
    const recomputed = recomputeRelativeSets(def, fixed, rpeDay(1, 'squat'), resolved, { 'squat-top:0': 180 });
    expect(weightsOf(recomputed, 'squat-fixed')).toEqual([167.5, 167.5, 167.5]);
  });

  it('the moved back-offs carry snapshots at the new weight', () => {
    const resolved = squatDay(fixed);
    const recomputed = recomputeRelativeSets(def, fixed, rpeDay(1, 'squat'), resolved, { 'squat-top:0': 180 });
    expect(slotOf(recomputed, 'squat-fixed').sets.map((set) => set.snapshot?.weightKg)).toEqual([167.5, 167.5, 167.5]);
  });

  it('the edited top set keeps its prescribed snapshot of 172.5, so success is still judged against the prescription', () => {
    const resolved = squatDay();
    const recomputed = recomputeRelativeSets(def, fatigue, rpeDay(1, 'squat'), resolved, { 'squat-top:0': 180 });
    expect(slotOf(recomputed, 'squat-top').sets[0].snapshot?.weightKg).toBe(172.5);
  });

  it('with no edits nothing moves: back-offs stay at 165', () => {
    const resolved = squatDay();
    expect(weightsOf(recomputeRelativeSets(def, fatigue, rpeDay(1, 'squat'), resolved, {}), 'squat-fatigue')).toEqual([
      165, 165, 165, 165, 165,
    ]);
  });

  it('an lb top edited to 400 lb moves the back-offs to 400 × 0.95 = 380 lb, emitted as 172.37 kg', () => {
    const lb = rpeEnrollment({ unit: 'lb', e1rms: { squat: 450 } });
    const resolved = squatDay(lb, 450);
    const recomputed = recomputeRelativeSets(def, lb, rpeDay(1, 'squat'), resolved, { 'squat-top:0': 400 });
    expect(weightsOf(recomputed, 'squat-fatigue')[0]).toBe(380);
    expect(weightsKgOf(recomputed, 'squat-fatigue')[0]).toBe(172.37);
  });
});
