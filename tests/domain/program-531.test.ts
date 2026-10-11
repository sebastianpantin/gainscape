import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUNDING, programStateAt, resolvePrescription } from '@domain/index.ts';
import { initialProgramState } from '@domain/program-state.ts';
import { factClock, sessionFact, setReferenceFact } from './program-fixtures/facts.ts';
import {
  bbbSets531,
  cyclePosition,
  cycleSessions,
  FIVE_THREE_ONE as def,
  fiveThreeOneEnrollment,
  type FiveThreeOneLift,
  mainSets531,
} from './program-fixtures/five_three_one.ts';
import { refOf, refsState, repsOf, slotIdsOf, slotOf, weightsOf } from './program-fixtures/prescription-helpers.ts';

function resolve531(
  lift: FiveThreeOneLift,
  tm: number,
  week: number,
  options: Record<string, string | number> = {},
  cycle = 1,
) {
  const enrollment = fiveThreeOneEnrollment({ options });
  return resolvePrescription(def, enrollment, refsState({ [lift]: { tm } }), cyclePosition(cycle, week, lift), {});
}

describe('5/3/1 main sets (kg, primary)', () => {
  it('TM 100 week 3 is 75/85/95 × 5/3/1+', () => {
    const resolved = resolve531('squat', 100, 3);
    expect(weightsOf(resolved, 'squat-main')).toEqual([75, 85, 95]);
    expect(repsOf(resolved, 'squat-main')).toEqual([5, 3, 1]);
  });

  it('TM 100 week 3 marks only the last set AMRAP with minReps 1', () => {
    const sets = slotOf(resolve531('squat', 100, 3), 'squat-main').sets;
    expect(sets.map((set) => set.amrap)).toEqual([false, false, true]);
    expect(sets.map((set) => set.minReps)).toEqual([null, null, 1]);
  });

  it('TM 142.5 week 3 is 107.5/120/135 (106.875 → 107.5, 121.125 → 120, 135.375 → 135)', () => {
    expect(weightsOf(resolve531('squat', 142.5, 3), 'squat-main')).toEqual([107.5, 120, 135]);
  });

  it('TM 142.5 week 1 is 92.5/107.5/120 (92.625 → 92.5, 106.875 → 107.5, 121.125 → 120)', () => {
    expect(weightsOf(resolve531('squat', 142.5, 1), 'squat-main')).toEqual([92.5, 107.5, 120]);
  });

  it('TM 142.5 week 4 is 40/50/60% × 5 with no AMRAP (57 → 57.5, 71.25 → 72.5 tie up, 85.5 → 85)', () => {
    const sets = slotOf(resolve531('squat', 142.5, 4), 'squat-main').sets;
    expect(sets.map((set) => set.weight)).toEqual([57.5, 72.5, 85]);
    expect(sets.map((set) => set.reps)).toEqual([5, 5, 5]);
    expect(sets.map((set) => set.amrap)).toEqual([false, false, false]);
    expect(sets.map((set) => set.minReps)).toEqual([null, null, null]);
  });

  it('carries the week percentages on each set', () => {
    const sets = slotOf(resolve531('squat', 142.5, 2), 'squat-main').sets;
    expect(sets.map((set) => set.pct)).toEqual([0.7, 0.8, 0.9]);
  });

  it.each([
    ['squat', 142.5, 1, [92.5, 107.5, 120], '92.625/106.875/121.125'],
    ['squat', 142.5, 2, [100, 115, 127.5], '99.75/114/128.25'],
    ['squat', 142.5, 3, [107.5, 120, 135], '106.875/121.125/135.375'],
    ['squat', 142.5, 4, [57.5, 72.5, 85], '57/71.25/85.5'],
    ['bench', 97.5, 1, [62.5, 72.5, 82.5], '63.375/73.125/82.875'],
    ['bench', 97.5, 2, [67.5, 77.5, 87.5], '68.25/78/87.75'],
    ['bench', 97.5, 3, [72.5, 82.5, 92.5], '73.125/82.875/92.625'],
    ['bench', 97.5, 4, [40, 50, 57.5], '39/48.75/58.5'],
    ['deadlift', 182.5, 1, [117.5, 137.5, 155], '118.625/136.875/155.125'],
    ['deadlift', 182.5, 2, [127.5, 145, 165], '127.75/146/164.25'],
    ['deadlift', 182.5, 3, [137.5, 155, 172.5], '136.875/155.125/173.375'],
    ['deadlift', 182.5, 4, [72.5, 92.5, 110], '73/91.25/109.5'],
    ['press', 62.5, 1, [40, 47.5, 52.5], '40.625/46.875/53.125'],
    ['press', 62.5, 2, [45, 50, 57.5], '43.75/50/56.25'],
    ['press', 62.5, 3, [47.5, 52.5, 60], '46.875/53.125/59.375'],
    ['press', 62.5, 4, [25, 32.5, 37.5], '25/31.25/37.5'],
  ] as const)('%s TM %s week %s prescribes %j (raw %s)', (lift, tm, week, expected, raw) => {
    expect(weightsOf(resolve531(lift, tm, week), `${lift}-main`), `raw ${raw}`).toEqual(expected);
  });

  it.each([
    [1, [5, 5, 5], 5],
    [2, [3, 3, 3], 3],
    [3, [5, 3, 1], 1],
  ])('week %s is %j with the last set AMRAP at minReps %s', (week, reps, minReps) => {
    const sets = slotOf(resolve531('bench', 100, week), 'bench-main').sets;
    expect(sets.map((set) => set.reps)).toEqual(reps);
    expect(sets.map((set) => set.amrap)).toEqual([false, false, true]);
    expect(sets[2].minReps).toBe(minReps);
  });

  it('emits kg weights equal to the kg prescription for a kg enrollment', () => {
    const sets = slotOf(resolve531('squat', 142.5, 1), 'squat-main').sets;
    expect(sets.map((set) => set.weightKg)).toEqual([92.5, 107.5, 120]);
  });

  it('binds each lift to its exercise (press → ohp)', () => {
    expect(slotOf(resolve531('press', 60, 1), 'press-main').exerciseId).toBe('ohp');
  });

  it('snapshots each main set with its ref, kg weight, reps, minReps and AMRAP flag', () => {
    const sets = slotOf(resolve531('squat', 142.5, 1), 'squat-main').sets;
    expect(sets.map((set) => set.snapshot)).toEqual([
      { ref: 'squat-main:0', weightKg: 92.5, reps: 5, minReps: null, amrap: false },
      { ref: 'squat-main:1', weightKg: 107.5, reps: 5, minReps: null, amrap: false },
      { ref: 'squat-main:2', weightKg: 120, reps: 5, minReps: 5, amrap: true },
    ]);
  });

  it('names each set ref as slot:index', () => {
    const sets = slotOf(resolve531('deadlift', 180, 2), 'deadlift-main').sets;
    expect(sets.map((set) => set.ref)).toEqual(['deadlift-main:0', 'deadlift-main:1', 'deadlift-main:2']);
  });

  it('marks no main set optional', () => {
    const sets = slotOf(resolve531('squat', 100, 1), 'squat-main').sets;
    expect(sets.every((set) => !set.optional)).toBe(true);
  });

  it('floors week 4 at the 20 kg bar: press TM 40 gives 16 → 20, 20, 24 → 25', () => {
    expect(weightsOf(resolve531('press', 40, 4), 'press-main')).toEqual([20, 20, 25]);
  });

  it('uses a 1.25 kg nearest increment from the enrollment: TM 142.5 week 1 → 92.5/107.5/121.25', () => {
    const enrollment = fiveThreeOneEnrollment({ rounding: { ...DEFAULT_ROUNDING.kg, increment: 1.25 } });
    const resolved = resolvePrescription(
      def,
      enrollment,
      refsState({ squat: { tm: 142.5 } }),
      cyclePosition(1, 1, 'squat'),
      {},
    );
    expect(weightsOf(resolved, 'squat-main')).toEqual([92.5, 107.5, 121.25]);
  });

  it('uses down rounding from the enrollment: TM 142.5 week 1 → 92.5/105/120 (106.875 → 105)', () => {
    const enrollment = fiveThreeOneEnrollment({ rounding: { ...DEFAULT_ROUNDING.kg, mode: 'down' } });
    const resolved = resolvePrescription(
      def,
      enrollment,
      refsState({ squat: { tm: 142.5 } }),
      cyclePosition(1, 1, 'squat'),
      {},
    );
    expect(weightsOf(resolved, 'squat-main')).toEqual([92.5, 105, 120]);
  });
});

describe('5/3/1 supplemental options', () => {
  it('BBB at TM 100 is 5 × 10 @ 50 by default', () => {
    const resolved = resolve531('squat', 100, 1, { supplemental: 'bbb' });
    expect(weightsOf(resolved, 'squat-bbb')).toEqual([50, 50, 50, 50, 50]);
    expect(repsOf(resolved, 'squat-bbb')).toEqual([10, 10, 10, 10, 10]);
  });

  it('BBB with bbbPct 0.6 at TM 100 is 5 × 10 @ 60', () => {
    expect(weightsOf(resolve531('squat', 100, 1, { bbbPct: 0.6 }), 'squat-bbb')).toEqual([60, 60, 60, 60, 60]);
  });

  it('BBB with bbbPct 0.55 at TM 100 is 5 × 10 @ 55', () => {
    expect(weightsOf(resolve531('squat', 100, 1, { bbbPct: 0.55 }), 'squat-bbb')).toEqual([55, 55, 55, 55, 55]);
  });

  it('BBB sets carry no AMRAP', () => {
    const sets = slotOf(resolve531('bench', 100, 1), 'bench-bbb').sets;
    expect(sets.every((set) => !set.amrap)).toBe(true);
  });

  it('BBB is supplemental and follows the main sets', () => {
    const resolved = resolve531('squat', 100, 1);
    expect(slotIdsOf(resolved)).toEqual(['squat-main', 'squat-bbb']);
    expect(slotOf(resolved, 'squat-bbb').role).toBe('supplemental');
  });

  it.each([
    [1, 65],
    [2, 70],
    [3, 75],
  ])('FSL in week %s at TM 100 is 5 × 5 @ %s, the first set percentage', (week, weight) => {
    const resolved = resolve531('squat', 100, week, { supplemental: 'fsl' });
    expect(slotIdsOf(resolved)).toEqual(['squat-main', 'squat-fsl']);
    expect(weightsOf(resolved, 'squat-fsl')).toEqual([weight, weight, weight, weight, weight]);
    expect(repsOf(resolved, 'squat-fsl')).toEqual([5, 5, 5, 5, 5]);
  });

  it.each(['bbb', 'fsl'])('the deload week prescribes main sets only with supplemental %s', (supplemental) => {
    expect(slotIdsOf(resolve531('squat', 100, 4, { supplemental }))).toEqual(['squat-main']);
  });

  it('the deload week prescribes main sets only with bbbProgression beginner', () => {
    expect(slotIdsOf(resolve531('squat', 140, 4, { bbbProgression: 'beginner' }))).toEqual(['squat-main']);
  });

  it('supplemental none prescribes only the main sets', () => {
    expect(slotIdsOf(resolve531('squat', 100, 1, { supplemental: 'none' }))).toEqual(['squat-main']);
  });

  it.each([
    [1, 140, 42.5, '140 × 0.30 = 42 → 42.5'],
    [2, 145, 65, '145 × 0.45 = 65.25 → 65'],
    [3, 150, 90, '150 × 0.60 = 90'],
    [4, 155, 92.5, '155 × 0.60 = 93 → 92.5, holding 60% after cycle 3'],
  ])('bbbProgression beginner in cycle %s with squat TM %s gives BBB %s (%s)', (cycle, tm, weight) => {
    const resolved = resolve531('squat', tm, 1, { bbbProgression: 'beginner' }, cycle);
    expect(slotIdsOf(resolved)).toEqual(['squat-main', 'squat-bbb-beginner']);
    expect(weightsOf(resolved, 'squat-bbb-beginner')).toEqual([weight, weight, weight, weight, weight]);
  });
});

describe('5/3/1 initial training max', () => {
  it('copies an entered TM unrounded: 142.5', () => {
    const state = initialProgramState(def, fiveThreeOneEnrollment({ tms: { squat: 142.5 } }));
    expect(refOf(state, 'squat', 'tm')).toBe(142.5);
  });

  it('tmPct preset 0.85 with 1RM 160 gives TM 136 (160 × 0.85)', () => {
    const enrollment = fiveThreeOneEnrollment({ oneRms: { squat: 160 }, options: { tmPct: 0.85 } });
    expect(refOf(initialProgramState(def, enrollment), 'squat', 'tm')).toBeCloseTo(136, 9);
  });

  it('default tmPct 0.9 with 1RM 160 gives TM 144 (160 × 0.9)', () => {
    const enrollment = fiveThreeOneEnrollment({ oneRms: { squat: 160 } });
    expect(refOf(initialProgramState(def, enrollment), 'squat', 'tm')).toBeCloseTo(144, 9);
  });

  it('keeps a derived TM unrounded: 1RM 155 × 0.9 = 139.5', () => {
    const enrollment = fiveThreeOneEnrollment({ oneRms: { squat: 155 } });
    expect(refOf(initialProgramState(def, enrollment), 'squat', 'tm')).toBeCloseTo(139.5, 9);
  });

  it('starts at cycle 1, week 1 on the first day with nothing completed', () => {
    const state = initialProgramState(def, fiveThreeOneEnrollment());
    expect(state.position).toEqual(cyclePosition(1, 1, 'squat'));
    expect(state.completedDays).toEqual([]);
  });
});

describe('5/3/1 reference history', () => {
  const enrollment = fiveThreeOneEnrollment();
  const squatChanges = (facts: Parameters<typeof programStateAt>[2]) =>
    programStateAt(def, enrollment, facts).history.filter((change) => change.lift === 'squat');

  it('records the cycle-end increment: squat tm 140 → 145, reason increment', () => {
    expect(squatChanges(cycleSessions(factClock(), 1))).toEqual([
      expect.objectContaining({ lift: 'squat', var: 'tm', from: 140, to: expect.closeTo(145, 9), reason: 'increment' }),
    ]);
  });

  it('records a reset instead of the increment: squat tm 140 → 126, reason tmReset', () => {
    expect(squatChanges(cycleSessions(factClock(), 1, { lastSetReps: { 'squat@1': 4 } }))).toEqual([
      expect.objectContaining({ lift: 'squat', var: 'tm', from: 140, to: expect.closeTo(126, 9), reason: 'tmReset' }),
    ]);
  });

  it('records a set_reference, then the increment from the new value: 140 → 130 → 135', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1, { weeks: [1, 2] }),
      setReferenceFact(clock.next(), 'squat', 'tm', 130),
      ...cycleSessions(clock, 1, { weeks: [3, 4] }),
    ];
    expect(squatChanges(facts)).toEqual([
      expect.objectContaining({ from: 140, to: 130, reason: 'set_reference' }),
      expect.objectContaining({ from: 130, to: expect.closeTo(135, 9), reason: 'increment' }),
    ]);
  });

  it('records nothing for an incomplete cycle', () => {
    expect(squatChanges(cycleSessions(factClock(), 1, { weeks: [1, 2, 3] }))).toEqual([]);
  });
});

describe('5/3/1 cycle progression (kg)', () => {
  const enrollment = fiveThreeOneEnrollment();

  it('a complete cycle takes squat 140 → 145, bench 100 → 102.5, deadlift 180 → 185, press 60 → 62.5', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(145, 9);
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(102.5, 9);
    expect(refOf(state, 'deadlift', 'tm')).toBeCloseTo(185, 9);
    expect(refOf(state, 'press', 'tm')).toBeCloseTo(62.5, 9);
  });

  it('a complete cycle moves the position to cycle 2, week 1', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1));
    expect(state.position).toEqual(cyclePosition(2, 1, 'squat'));
    expect(state.completedDays).toEqual([]);
  });

  it('two complete cycles take squat 140 → 145 → 150 and bench 100 → 102.5 → 105', () => {
    const clock = factClock();
    const state = programStateAt(def, enrollment, [...cycleSessions(clock, 1), ...cycleSessions(clock, 2)]);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(150, 9);
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(105, 9);
  });

  it('an incomplete cycle (weeks 1–3 and week 4 squat only) changes no TM', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1, { weeks: [1, 2, 3] }),
      ...cycleSessions(clock, 1, { weeks: [4], lifts: ['squat'] }),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'tm')).toBe(140);
    expect(refOf(state, 'bench', 'tm')).toBe(100);
    expect(state.position).toEqual(cyclePosition(1, 4, 'bench'));
  });

  it('tmReset 10%: a week 1 AMRAP of 4 (min 5) gives squat 140 → 126 at cycle end, with no +5', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1, { lastSetReps: { 'squat@1': 4 } }));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(126, 9);
  });

  it('tmReset replaces only the missed lift increment: bench still 100 → 102.5', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1, { lastSetReps: { 'squat@1': 4 } }));
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(102.5, 9);
    expect(refOf(state, 'deadlift', 'tm')).toBeCloseTo(185, 9);
  });

  it('tmReset 15%: a week 1 AMRAP of 4 gives squat 140 → 119 (140 × 0.85)', () => {
    const resetEnrollment = fiveThreeOneEnrollment({ options: { tmReset: 0.15 } });
    const state = programStateAt(
      def,
      resetEnrollment,
      cycleSessions(factClock(), 1, { lastSetReps: { 'squat@1': 4 } }),
    );
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(119, 9);
  });

  it('tmReset does not fire before the cycle ends: squat stays 140 after the missed week 1', () => {
    const state = programStateAt(
      def,
      enrollment,
      cycleSessions(factClock(), 1, { weeks: [1], lastSetReps: { 'squat@1': 4 } }),
    );
    expect(refOf(state, 'squat', 'tm')).toBe(140);
  });

  it('a week 2 AMRAP of 2 (min 3) also resets bench 100 → 90 at cycle end', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1, { lastSetReps: { 'bench@2': 2 } }));
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(90, 9);
  });

  it('an AMRAP above the minimum is met: week 3 AMRAP of 8 still gives the +5', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1, { lastSetReps: { 'squat@3': 8 } }));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(145, 9);
  });

  it('a deload-week miss is neutral: a 4-rep week 4 last set (prescribed 5) still gives squat 140 → 145', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1, { lastSetReps: { 'squat@4': 4 } }));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(145, 9);
  });

  it('a deload-week miss records no miss outcome for the week 4 squat day', () => {
    const state = programStateAt(def, enrollment, cycleSessions(factClock(), 1, { lastSetReps: { 'squat@4': 4 } }));
    const deloadDay = state.days.find(
      (record) => 'cycle' in record.position && record.position.week === 4 && record.position.day === 'squat',
    );
    expect(deloadDay?.status).toBe('completed');
    expect(deloadDay?.outcomes.squat ?? 'neutral').toBe('neutral');
  });

  it('judges only the + set: logging just each week 1–3 + set at 5 reps over the minimum gives squat 140 → 145', () => {
    const plusSetOnly = cycleSessions(factClock(), 1, {
      lastSetReps: { 'squat@1': 10, 'squat@2': 8, 'squat@3': 6 },
    }).map((fact) =>
      fact.kind === 'session' && 'week' in fact.position && fact.position.week < 4
        ? { ...fact, sets: fact.sets.filter((set) => set.prescription?.ref.endsWith(':2')) }
        : fact,
    );
    expect(refOf(programStateAt(def, enrollment, plusSetOnly), 'squat', 'tm')).toBeCloseTo(145, 9);
  });

  it('a short ramp set is not judged: a 3-rep first set in week 1 (prescribed 5) still gives squat 140 → 145', () => {
    const shortRampSet = cycleSessions(factClock(), 1).map((fact) =>
      fact.kind === 'session' && 'week' in fact.position && fact.position.week === 1
        ? { ...fact, sets: fact.sets.map((set, index) => (index === 0 ? { ...set, reps: 3 } : set)) }
        : fact,
    );
    expect(refOf(programStateAt(def, enrollment, shortRampSet), 'squat', 'tm')).toBeCloseTo(145, 9);
  });

  it('a skipped + set is a miss: logging only the week 1 ramp sets resets squat 140 → 126', () => {
    const rampSetsOnly = cycleSessions(factClock(), 1).map((fact) =>
      fact.kind === 'session' && 'week' in fact.position && fact.position.week === 1 && fact.position.day === 'squat'
        ? { ...fact, sets: fact.sets.filter((set) => !set.prescription?.ref.endsWith(':2')) }
        : fact,
    );
    expect(refOf(programStateAt(def, enrollment, rampSetsOnly), 'squat', 'tm')).toBeCloseTo(126, 9);
  });

  it('set_reference to 130 mid-cycle gives 135 at cycle end', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1, { weeks: [1, 2] }),
      setReferenceFact(clock.next(), 'squat', 'tm', 130),
      ...cycleSessions(clock, 1, { weeks: [3, 4] }),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(135, 9);
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(102.5, 9);
  });

  it('set_reference applies immediately: squat reads 130 before the cycle ends', () => {
    const clock = factClock();
    const facts = [...cycleSessions(clock, 1, { weeks: [1] }), setReferenceFact(clock.next(), 'squat', 'tm', 130)];
    expect(refOf(programStateAt(def, enrollment, facts), 'squat', 'tm')).toBe(130);
  });

  it('BBB sets never judge the TM: a 6-rep last BBB set still gives the +5', () => {
    const clock = factClock();
    const facts = cycleSessions(clock, 1).map((fact) =>
      fact.kind === 'session' && 'day' in fact.position && fact.position.day === 'squat'
        ? { ...fact, sets: [...fact.sets, ...bbbSets531('squat', 6)] }
        : fact,
    );
    expect(refOf(programStateAt(def, enrollment, facts), 'squat', 'tm')).toBeCloseTo(145, 9);
  });

  it('bbbProgression beginner over a folded cycle: TM 140 → 145 → 150 then cycle 3 BBB is 90', () => {
    const clock = factClock();
    const beginner = fiveThreeOneEnrollment({ options: { bbbProgression: 'beginner' } });
    const state = programStateAt(def, beginner, [...cycleSessions(clock, 1), ...cycleSessions(clock, 2)]);
    expect(state.position).toEqual(cyclePosition(3, 1, 'squat'));
    const resolved = resolvePrescription(def, beginner, state, state.position, {});
    expect(weightsOf(resolved, 'squat-bbb-beginner')).toEqual([90, 90, 90, 90, 90]);
  });

  it('an ahead position implicitly skips while the cycle increment still fires for completed lifts', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1, { lifts: ['squat'] }),
      sessionFact(clock.next(), cyclePosition(2, 1, 'squat'), mainSets531('squat', 1)),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(145, 9);
    expect(refOf(state, 'bench', 'tm')).toBe(100);
    expect(refOf(state, 'deadlift', 'tm')).toBe(180);
    expect(refOf(state, 'press', 'tm')).toBe(60);
    expect(state.position).toEqual(cyclePosition(2, 1, 'bench'));
    expect(state.completedDays).toEqual(['squat']);
  });
});
