import { describe, expect, it } from 'vitest';
import {
  initialProgramState,
  type ProgramEnrollment,
  programStateAt,
  type ReferenceState,
  resolvePrescription,
} from '@domain/index.ts';
import { factClock, sessionFact, setReferenceFact, unprescribedSet } from './program-fixtures/facts.ts';
import {
  MADCOW_5X5 as def,
  madcowDaySets,
  madcowEnrollment,
  madcowWeek,
  metMadcowWeeks,
  weekDay,
} from './program-fixtures/madcow_5x5.ts';
import {
  missesOf,
  refOf,
  refsState,
  repsOf,
  slotIdsOf,
  slotOf,
  weightsKgOf,
  weightsOf,
} from './program-fixtures/prescription-helpers.ts';

const WEEKS_BACK_FACTOR = 0.975;

function weeksBack(top: number, weeks: number): number {
  return top * WEEKS_BACK_FACTOR ** weeks;
}

const enrollment = madcowEnrollment();

function onRampTop(fiveRm: number, week: number): number {
  return fiveRm * 0.975 ** (4 - week);
}

function resolveDay(
  state: ReferenceState,
  week: number,
  day: 'mon' | 'wed' | 'fri',
  enrollmentUsed: ProgramEnrollment = enrollment,
  lastLogged: Record<string, number> = {},
) {
  return resolvePrescription(def, enrollmentUsed, state, weekDay(week, day), lastLogged);
}

function topState(tops: Record<string, number>): ReferenceState {
  return refsState(Object.fromEntries(Object.entries(tops).map(([lift, top]) => [lift, { top }])));
}

describe('Madcow on-ramp: week k top = 5RM × 0.975^(4−k)', () => {
  it('squat 5RM 100 starts week 1 at the raw top 92.69 (100 × 0.975^3 = 92.6859)', () => {
    expect(refOf(initialProgramState(def, enrollment), 'squat', 'top')).toBeCloseTo(92.69, 2);
  });

  it('starts at week 1 Monday with nothing completed', () => {
    const state = initialProgramState(def, enrollment);
    expect(state.position).toEqual(weekDay(1, 'mon'));
    expect(state.completedDays).toEqual([]);
  });

  it.each([
    [0, 92.69, '100 × 0.975^3'],
    [1, 95.06, '100 × 0.975^2'],
    [2, 97.5, '100 × 0.975'],
    [3, 100, '100 × 0.975^0'],
  ])('after %s met weeks the squat top is %s (%s)', (metWeeks, top) => {
    const weeks = Array.from({ length: metWeeks }, (_, index) => index + 1);
    const state = programStateAt(def, enrollment, metMadcowWeeks(factClock(), weeks));
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(top, 2);
    expect(state.position).toEqual(weekDay(metWeeks + 1, 'mon'));
  });

  it.each([
    [1, 92.5],
    [2, 95],
    [3, 97.5],
    [4, 100],
  ])('squat 5RM 100 week %s Monday top set rounds to %s', (week, topSet) => {
    const resolved = resolveDay(topState({ squat: onRampTop(100, week) }), week, 'mon');
    expect(weightsOf(resolved, 'mon-squat')[4]).toBe(topSet);
  });

  it('squat 5RM 120 week 1 top is 111.22 and rounds to 110 (120 × 0.975^3 = 111.2231; / 2.5 = 44.49 → 44)', () => {
    const state = initialProgramState(def, madcowEnrollment({ fiveRms: { squat: 120 } }));
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(111.22, 2);
    const topSet = weightsOf(resolveDay(state, 1, 'mon'), 'mon-squat')[4];
    expect(topSet).toBe(110);
    expect(topSet).not.toBe(112.5);
  });

  it('deadlift 5RM 140 Wednesday tops for weeks 1–4 are 130/132.5/137.5/140 (129.76/133.09/136.5/140)', () => {
    const tops = [1, 2, 3, 4].map(
      (week) => weightsOf(resolveDay(topState({ deadlift: onRampTop(140, week) }), week, 'wed'), 'wed-deadlift')[3],
    );
    expect(tops).toEqual([130, 132.5, 137.5, 140]);
  });

  it('a met week 4 gives a week 5 top of 102.5 (100 × 1.025)', () => {
    const state = programStateAt(def, enrollment, metMadcowWeeks(factClock(), [1, 2, 3, 4]));
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
    expect(state.position).toEqual(weekDay(5, 'mon'));
  });

  it('every main lift progresses 2.5% after a met week 4: bench 82, row 71.75, press 51.25, deadlift 143.5', () => {
    const state = programStateAt(def, enrollment, metMadcowWeeks(factClock(), [1, 2, 3, 4]));
    expect(refOf(state, 'bench', 'top')).toBeCloseTo(82, 9);
    expect(refOf(state, 'row', 'top')).toBeCloseTo(71.75, 9);
    expect(refOf(state, 'press', 'top')).toBeCloseTo(51.25, 9);
    expect(refOf(state, 'deadlift', 'top')).toBeCloseTo(143.5, 9);
  });

  it('the week 5 Monday top equals the week 4 Friday triple (102.5)', () => {
    const afterWeek3 = programStateAt(def, enrollment, metMadcowWeeks(factClock(), [1, 2, 3]));
    const fridayTriple = weightsOf(resolveDay(afterWeek3, 4, 'fri'), 'fri-squat')[4];
    const afterWeek4 = programStateAt(def, enrollment, metMadcowWeeks(factClock(), [1, 2, 3, 4]));
    const mondayTop = weightsOf(resolveDay(afterWeek4, 5, 'mon'), 'mon-squat')[4];
    expect(fridayTriple).toBe(102.5);
    expect(mondayTop).toBe(fridayTriple);
  });
});

describe('Madcow day prescriptions at a top of 100 (week 4, 12.5% ramp)', () => {
  const state = topState({ squat: 100, bench: 100, row: 100, press: 100, deadlift: 100 });

  it('Monday ramps 50/62.5/75/87.5/100 × 5 for squat, bench and row', () => {
    const resolved = resolveDay(state, 4, 'mon');
    for (const slot of ['mon-squat', 'mon-bench', 'mon-row']) {
      expect(weightsOf(resolved, slot)).toEqual([50, 62.5, 75, 87.5, 100]);
      expect(repsOf(resolved, slot)).toEqual([5, 5, 5, 5, 5]);
    }
  });

  it('Monday carries the ramp percentages 0.5/0.625/0.75/0.875/1', () => {
    const sets = slotOf(resolveDay(state, 4, 'mon'), 'mon-squat').sets;
    expect(sets.map((set) => set.pct)).toEqual([0.5, 0.625, 0.75, 0.875, 1]);
  });

  it('Wednesday squat is Monday sets 1–3, then set 3 repeated: 50/62.5/75/75 × 5', () => {
    const resolved = resolveDay(state, 4, 'wed');
    expect(weightsOf(resolved, 'wed-squat')).toEqual([50, 62.5, 75, 75]);
    expect(repsOf(resolved, 'wed-squat')).toEqual([5, 5, 5, 5]);
  });

  it('Wednesday press and deadlift ramp 4 × 5 to their own top: 62.5/75/87.5/100', () => {
    const resolved = resolveDay(state, 4, 'wed');
    expect(weightsOf(resolved, 'wed-press')).toEqual([62.5, 75, 87.5, 100]);
    expect(weightsOf(resolved, 'wed-deadlift')).toEqual([62.5, 75, 87.5, 100]);
    expect(repsOf(resolved, 'wed-press')).toEqual([5, 5, 5, 5]);
  });

  it('Friday is 50/62.5/75/87.5 × 5, then 102.5 × 3, then 75 × 8', () => {
    const resolved = resolveDay(state, 4, 'fri');
    for (const slot of ['fri-squat', 'fri-bench', 'fri-row']) {
      expect(weightsOf(resolved, slot)).toEqual([50, 62.5, 75, 87.5, 102.5, 75]);
      expect(repsOf(resolved, slot)).toEqual([5, 5, 5, 5, 3, 8]);
    }
  });

  it('lists the day slots in definition order with assistance last', () => {
    expect(slotIdsOf(resolveDay(state, 4, 'mon'))).toEqual([
      'mon-squat',
      'mon-bench',
      'mon-row',
      'mon-hyper',
      'mon-situp',
    ]);
    expect(slotIdsOf(resolveDay(state, 4, 'wed'))).toEqual(['wed-squat', 'wed-press', 'wed-deadlift', 'wed-situp']);
    expect(slotIdsOf(resolveDay(state, 4, 'fri'))).toEqual([
      'fri-squat',
      'fri-bench',
      'fri-row',
      'fri-dip',
      'fri-curl',
      'fri-triceps',
    ]);
  });

  it('snapshots the Monday top set with its ref, weight and reps', () => {
    const top = slotOf(resolveDay(state, 4, 'mon'), 'mon-squat').sets[4];
    expect(top.snapshot).toEqual({ ref: 'mon-squat:4', weightKg: 100, reps: 5, minReps: null, amrap: false });
  });

  it('snapshots the Friday triple with its own ref', () => {
    const triple = slotOf(resolveDay(state, 4, 'fri'), 'fri-squat').sets[4];
    expect(triple.snapshot).toEqual({ ref: 'fri-squat:4', weightKg: 102.5, reps: 3, minReps: null, amrap: false });
  });

  it('binds the press slot to the chosen press exercise', () => {
    expect(slotOf(resolveDay(state, 4, 'wed'), 'wed-press').exerciseId).toBe('ohp');
  });
});

describe('Madcow ramp step option', () => {
  const state = topState({ squat: 100, press: 100 });

  it('rampStep 10% with a top of 100 gives 60/70/80/90/100', () => {
    const resolved = resolveDay(state, 4, 'mon', madcowEnrollment({ options: { rampStep: 0.1 } }));
    expect(weightsOf(resolved, 'mon-squat')).toEqual([60, 70, 80, 90, 100]);
  });

  it('rampStep 10% gives Wednesday press 70/80/90/100', () => {
    const resolved = resolveDay(state, 4, 'wed', madcowEnrollment({ options: { rampStep: 0.1 } }));
    expect(weightsOf(resolved, 'wed-press')).toEqual([70, 80, 90, 100]);
  });

  it('rampStep 10% Wednesday squat repeats set 3: 60/70/80/80', () => {
    const resolved = resolveDay(state, 4, 'wed', madcowEnrollment({ options: { rampStep: 0.1 } }));
    expect(weightsOf(resolved, 'wed-squat')).toEqual([60, 70, 80, 80]);
  });

  it('rampStep 15% with a top of 100 gives 40/55/70/85/100', () => {
    const resolved = resolveDay(state, 4, 'mon', madcowEnrollment({ options: { rampStep: 0.15 } }));
    expect(weightsOf(resolved, 'mon-squat')).toEqual([40, 55, 70, 85, 100]);
  });

  it('rampStep 15% Friday is 40/55/70/85 × 5, 102.5 × 3, 70 × 8', () => {
    const resolved = resolveDay(state, 4, 'fri', madcowEnrollment({ options: { rampStep: 0.15 } }));
    expect(weightsOf(resolved, 'fri-squat')).toEqual([40, 55, 70, 85, 102.5, 70]);
  });
});

describe('Madcow weeks 1–5 for every main lift (squat 100, bench 80, row 70, press 50, deadlift 140 5RMs)', () => {
  const tops = (week: number) => ({
    squat: week === 5 ? 100 * 1.025 : onRampTop(100, week),
    bench: week === 5 ? 80 * 1.025 : onRampTop(80, week),
    row: week === 5 ? 70 * 1.025 : onRampTop(70, week),
    press: week === 5 ? 50 * 1.025 : onRampTop(50, week),
    deadlift: week === 5 ? 140 * 1.025 : onRampTop(140, week),
  });

  it.each([
    ['squat', 1, [47.5, 57.5, 70, 80, 92.5], '92.69 → 92.5; × .5/.625/.75/.875 = 46.25/57.81/69.38/80.94'],
    ['squat', 2, [47.5, 60, 72.5, 82.5, 95], '95.06 → 95; 47.5/59.38/71.25/83.13'],
    ['squat', 3, [50, 60, 72.5, 85, 97.5], '97.5; 48.75/60.94/73.13/85.31'],
    ['squat', 4, [50, 62.5, 75, 87.5, 100], '100; 50/62.5/75/87.5'],
    ['squat', 5, [52.5, 65, 77.5, 90, 102.5], '102.5; 51.25/64.06/76.88/89.69'],
    ['bench', 1, [37.5, 47.5, 57.5, 65, 75], '74.15 → 75; 37.5/46.88/56.25/65.63'],
    ['bench', 2, [37.5, 47.5, 57.5, 65, 75], '76.05 → 75; 37.5/46.88/56.25/65.63'],
    ['bench', 3, [40, 47.5, 57.5, 67.5, 77.5], '78 → 77.5; 38.75/48.44/58.13/67.81'],
    ['bench', 4, [40, 50, 60, 70, 80], '80; 40/50/60/70'],
    ['bench', 5, [42.5, 52.5, 62.5, 72.5, 82.5], '82 → 82.5; 41.25/51.56/61.88/72.19'],
    ['row', 1, [32.5, 40, 50, 57.5, 65], '64.88 → 65; 32.5/40.63/48.75/56.88'],
    ['row', 2, [35, 42.5, 50, 60, 67.5], '66.54 → 67.5; 33.75/42.19/50.63/59.06'],
    ['row', 3, [35, 42.5, 50, 60, 67.5], '68.25 → 67.5; 33.75/42.19/50.63/59.06'],
    ['row', 4, [35, 45, 52.5, 62.5, 70], '70; 35/43.75/52.5/61.25'],
    ['row', 5, [37.5, 45, 55, 62.5, 72.5], '71.75 → 72.5; 36.25/45.31/54.38/63.44'],
  ] as const)('Monday %s week %s ramps from the rounded top to %j (%s)', (lift, week, expected, arithmetic) => {
    expect(weightsOf(resolveDay(topState(tops(week)), week, 'mon'), `mon-${lift}`), arithmetic).toEqual(expected);
  });

  it.each([
    ['press', 1, [30, 35, 42.5, 47.5], '46.34 → 47.5; × .625/.75/.875 = 29.69/35.63/41.56'],
    ['press', 2, [30, 35, 42.5, 47.5], '47.53 → 47.5; 29.69/35.63/41.56'],
    ['press', 3, [32.5, 37.5, 45, 50], '48.75 → 50; 31.25/37.5/43.75'],
    ['press', 4, [32.5, 37.5, 45, 50], '50; 31.25/37.5/43.75'],
    ['press', 5, [32.5, 40, 45, 52.5], '51.25 → 52.5; 32.81/39.38/45.94'],
    ['deadlift', 1, [82.5, 97.5, 115, 130], '129.76 → 130; 81.25/97.5/113.75'],
    ['deadlift', 2, [82.5, 100, 115, 132.5], '133.09 → 132.5; 82.81/99.38/115.94'],
    ['deadlift', 3, [85, 102.5, 120, 137.5], '136.5 → 137.5; 85.94/103.13/120.31'],
    ['deadlift', 4, [87.5, 105, 122.5, 140], '140; 87.5/105/122.5'],
    ['deadlift', 5, [90, 107.5, 125, 142.5], '143.5 → 142.5; 89.06/106.88/124.69'],
  ] as const)('Wednesday %s week %s ramps 4 × 5 to its own top: %j (%s)', (lift, week, expected, arithmetic) => {
    expect(weightsOf(resolveDay(topState(tops(week)), week, 'wed'), `wed-${lift}`), arithmetic).toEqual(expected);
  });

  it.each([
    [1, [47.5, 57.5, 70, 70]],
    [2, [47.5, 60, 72.5, 72.5]],
    [3, [50, 60, 72.5, 72.5]],
    [4, [50, 62.5, 75, 75]],
    [5, [52.5, 65, 77.5, 77.5]],
  ])('Wednesday squat week %s repeats Monday set 3: %j', (week, expected) => {
    expect(weightsOf(resolveDay(topState(tops(week)), week, 'wed'), 'wed-squat')).toEqual(expected);
  });

  it.each([
    ['squat', 1, [47.5, 57.5, 70, 80, 95, 70], '92.69 × 1.025 = 95.00 → 95'],
    ['squat', 2, [47.5, 60, 72.5, 82.5, 97.5, 72.5], '95.06 × 1.025 = 97.44 → 97.5'],
    ['squat', 3, [50, 60, 72.5, 85, 100, 72.5], '97.5 × 1.025 = 99.94 → 100'],
    ['squat', 4, [50, 62.5, 75, 87.5, 102.5, 75], '100 × 1.025 = 102.5'],
    ['squat', 5, [52.5, 65, 77.5, 90, 105, 77.5], '102.5 × 1.025 = 105.06 → 105'],
    [
      'bench',
      1,
      [37.5, 47.5, 57.5, 65, 75, 57.5],
      '74.15 × 1.025 = 76.00 → 75: triple equals next Monday top; equals this Monday at 2.5 kg rounding',
    ],
    ['bench', 2, [37.5, 47.5, 57.5, 65, 77.5, 57.5], '76.05 × 1.025 = 77.95 → 77.5'],
    ['bench', 3, [40, 47.5, 57.5, 67.5, 80, 57.5], '78 × 1.025 = 79.95 → 80'],
    ['bench', 4, [40, 50, 60, 70, 82.5, 60], '80 × 1.025 = 82 → 82.5'],
    ['bench', 5, [42.5, 52.5, 62.5, 72.5, 85, 62.5], '82 × 1.025 = 84.05 → 85'],
    ['row', 1, [32.5, 40, 50, 57.5, 67.5, 50], '64.88 × 1.025 = 66.50 → 67.5'],
    [
      'row',
      2,
      [35, 42.5, 50, 60, 67.5, 50],
      '66.54 × 1.025 = 68.21 → 67.5: triple equals next Monday top; equals this Monday at 2.5 kg rounding',
    ],
    ['row', 3, [35, 42.5, 50, 60, 70, 50], '68.25 × 1.025 = 69.96 → 70'],
    ['row', 4, [35, 45, 52.5, 62.5, 72.5, 52.5], '70 × 1.025 = 71.75 → 72.5'],
    [
      'row',
      5,
      [37.5, 45, 55, 62.5, 72.5, 55],
      '71.75 × 1.025 = 73.54 → 72.5: triple equals next Monday top; equals this Monday at 2.5 kg rounding',
    ],
  ] as const)(
    'Friday %s week %s is Monday sets 1–4, the triple at raw top × 1.025 and set 3 × 8: %j (%s)',
    (lift, week, expected, arithmetic) => {
      expect(weightsOf(resolveDay(topState(tops(week)), week, 'fri'), `fri-${lift}`), arithmetic).toEqual(expected);
    },
  );
});

describe('Madcow on-ramp with a miss or a skip (calendar week 4 is the peak)', () => {
  it('a week 2 Monday miss holds week 3 at the week 2 top 95.06, then week 4 = 95.0625 / 0.975 = 97.5, week 5 = 97.5 × 1.025 = 99.94', () => {
    const clock = factClock();
    const facts = [...madcowWeek(clock, 1), ...madcowWeek(clock, 2, { mondayTopReps: { squat: 4 } })];
    const afterWeek2 = programStateAt(def, enrollment, facts);
    expect(refOf(afterWeek2, 'squat', 'top')).toBeCloseTo(95.06, 2);
    const afterWeek3 = programStateAt(def, enrollment, [...facts, ...madcowWeek(clock, 3)]);
    expect(refOf(afterWeek3, 'squat', 'top')).toBeCloseTo(97.5, 9);
    const afterWeek4 = programStateAt(def, enrollment, [...facts, ...metMadcowWeeks(clock, [3, 4])]);
    expect(refOf(afterWeek4, 'squat', 'top')).toBeCloseTo(99.9375, 9);
  });

  it('the held week 3 prescribes the week 2 top set again: 95', () => {
    const clock = factClock();
    const facts = [...madcowWeek(clock, 1), ...madcowWeek(clock, 2, { mondayTopReps: { squat: 4 } })];
    expect(weightsOf(resolveDay(programStateAt(def, enrollment, facts), 3, 'mon'), 'mon-squat')[4]).toBe(95);
  });

  it('after the on-ramp miss the week 5 top 99.94 rounds to 100 (99.9375 / 2.5 = 39.975 → 40)', () => {
    const clock = factClock();
    const facts = [
      ...madcowWeek(clock, 1),
      ...madcowWeek(clock, 2, { mondayTopReps: { squat: 4 } }),
      ...metMadcowWeeks(clock, [3, 4]),
    ];
    expect(weightsOf(resolveDay(programStateAt(def, enrollment, facts), 5, 'mon'), 'mon-squat')[4]).toBe(100);
  });

  it('a skipped week 3 Monday holds week 4 at 97.5, then week 5 = 97.5 × 1.025 = 99.94', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2]), ...madcowWeek(clock, 3, { skip: ['mon'] })];
    const afterWeek3 = programStateAt(def, enrollment, facts);
    expect(refOf(afterWeek3, 'squat', 'top')).toBeCloseTo(97.5, 9);
    expect(missesOf(afterWeek3, 'squat:top:endOfWeek')).toBe(0);
    const afterWeek4 = programStateAt(def, enrollment, [...facts, ...madcowWeek(clock, 4)]);
    expect(refOf(afterWeek4, 'squat', 'top')).toBeCloseTo(99.9375, 9);
  });
});

describe('Madcow reference history and day outcomes', () => {
  it('records a met week 4 as an increment: squat top 100 → 102.5', () => {
    const state = programStateAt(def, enrollment, metMadcowWeeks(factClock(), [1, 2, 3, 4]));
    const lastSquatChange = state.history.filter((change) => change.lift === 'squat').at(-1);
    expect(lastSquatChange).toEqual(
      expect.objectContaining({
        lift: 'squat',
        var: 'top',
        from: expect.closeTo(100, 9),
        to: expect.closeTo(102.5, 9),
        reason: 'increment',
      }),
    );
  });

  it('records a stall reset as a set_reference: squat top 102.5 → 90.37', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3, 4]), setReferenceFact(clock.next(), 'squat', 'top', 90.37)];
    const lastSquatChange = programStateAt(def, enrollment, facts)
      .history.filter((change) => change.lift === 'squat')
      .at(-1);
    expect(lastSquatChange).toEqual(
      expect.objectContaining({ from: expect.closeTo(102.5, 9), to: 90.37, reason: 'set_reference' }),
    );
  });

  it('records the Monday outcomes per lift on the day record: squat missed, bench and row met', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { mondayTopReps: { squat: 4 } })];
    const monday = programStateAt(def, enrollment, facts).days.find(
      (record) =>
        'week' in record.position &&
        record.position.week === 4 &&
        'day' in record.position &&
        record.position.day === 'mon',
    );
    expect(monday?.status).toBe('completed');
    expect(monday?.outcomes).toEqual({ squat: 'missed', bench: 'met', row: 'met' });
  });

  it('records a skipped day with no met or missed outcome', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { skip: ['mon'] })];
    const monday = programStateAt(def, enrollment, facts).days.find(
      (record) =>
        'week' in record.position &&
        record.position.week === 4 &&
        'day' in record.position &&
        record.position.day === 'mon',
    );
    expect(monday?.status).toBe('skipped');
    expect(Object.values(monday?.outcomes ?? {}).every((outcome) => outcome === 'neutral')).toBe(true);
  });
});

describe('Madcow unbound main lift', () => {
  const unbound = madcowEnrollment({ bindings: { row: null } });

  it('omits the row slots from Monday and Friday when the row has no binding', () => {
    const state = topState({ squat: 100, bench: 100, row: 100 });
    expect(slotIdsOf(resolveDay(state, 4, 'mon', unbound))).not.toContain('mon-row');
    expect(slotIdsOf(resolveDay(state, 4, 'fri', unbound))).not.toContain('fri-row');
  });

  it('treats the unbound row as neutral in the fold: the row top stays at its week 1 value 64.88 (70 × 0.975^3) with no miss', () => {
    const state = programStateAt(def, unbound, metMadcowWeeks(factClock(), [1, 2, 3, 4]));
    expect(refOf(state, 'row', 'top')).toBeCloseTo(64.88, 2);
    expect(missesOf(state, 'row:top:endOfWeek')).toBe(0);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
  });
});

describe('Madcow miss rule (holdOnMiss, judged on each lift top day)', () => {
  it('a 4-rep Monday top set in week 4 leaves Wednesday and Friday unchanged (Friday triple 102.5)', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { mondayTopReps: { squat: 4 }, omit: ['wed', 'fri'] }),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
    expect(weightsOf(resolveDay(state, 4, 'wed'), 'wed-squat')).toEqual([50, 62.5, 75, 75]);
    expect(weightsOf(resolveDay(state, 4, 'fri'), 'fri-squat')).toEqual([50, 62.5, 75, 87.5, 102.5, 75]);
  });

  it('judges only the Monday top set: logging just the fifth squat set in week 4 takes the top 100 → 102.5', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4).map((fact) =>
        fact.kind === 'session' && 'day' in fact.position && fact.position.day === 'mon'
          ? { ...fact, sets: fact.sets.filter((set) => !/^mon-squat:[0-3]$/.test(set.prescription?.ref ?? '')) }
          : fact,
      ),
    ];
    expect(refOf(programStateAt(def, enrollment, facts), 'squat', 'top')).toBeCloseTo(102.5, 9);
  });

  it('judges only the Wednesday top set: a 3-rep deadlift ramp set still takes the deadlift 140 → 143.5', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4).map((fact) =>
        fact.kind === 'session' && 'day' in fact.position && fact.position.day === 'wed'
          ? {
              ...fact,
              sets: fact.sets.map((set) => (set.prescription?.ref === 'wed-deadlift:1' ? { ...set, reps: 3 } : set)),
            }
          : fact,
      ),
    ];
    expect(refOf(programStateAt(def, enrollment, facts), 'deadlift', 'top')).toBeCloseTo(143.5, 9);
  });

  it('a missed week 4 Monday keeps the week 5 squat top at 100 and counts one miss', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { mondayTopReps: { squat: 4 } })];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
    expect(missesOf(state, 'squat:top:endOfWeek')).toBe(1);
  });

  it('the squat miss does not hold bench: bench still goes 80 → 82', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { mondayTopReps: { squat: 4 } })];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'bench', 'top')).toBeCloseTo(82, 9);
    expect(missesOf(state, 'bench:top:endOfWeek')).toBe(0);
  });

  it('a second miss in week 5 keeps the week 6 top at 100, with no automatic deload', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { mondayTopReps: { squat: 4 } }),
      ...madcowWeek(clock, 5, { mondayTopReps: { squat: 3 } }),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
    expect(missesOf(state, 'squat:top:endOfWeek')).toBe(2);
    expect(weightsOf(resolveDay(state, 6, 'mon'), 'mon-squat')).toEqual([50, 62.5, 75, 87.5, 100]);
  });

  it('a met week after two misses progresses 100 → 102.5 and resets the miss count', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { mondayTopReps: { squat: 4 } }),
      ...madcowWeek(clock, 5, { mondayTopReps: { squat: 3 } }),
      ...madcowWeek(clock, 6),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 2);
    expect(missesOf(state, 'squat:top:endOfWeek')).toBe(0);
  });

  it('a missed Friday triple does not judge the squat: week 5 top still 102.5', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { fridayTripleReps: { squat: 2 } })];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
    expect(missesOf(state, 'squat:top:endOfWeek')).toBe(0);
  });

  it('a missed Wednesday squat set does not judge the squat: week 5 top still 102.5', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { wednesdaySquatLastReps: 3 })];
    expect(refOf(programStateAt(def, enrollment, facts), 'squat', 'top')).toBeCloseTo(102.5, 9);
  });

  it('press is judged on Wednesday: a 4-rep Wednesday press top holds press at 50 while deadlift goes 140 → 143.5', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { wednesdayTopReps: { press: 4 } })];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'press', 'top')).toBeCloseTo(50, 2);
    expect(missesOf(state, 'press:top:endOfWeek')).toBe(1);
    expect(refOf(state, 'deadlift', 'top')).toBeCloseTo(143.5, 9);
  });

  it('the top does not move mid-week: after a met week 4 Monday the squat top is still 100', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { omit: ['wed', 'fri'] })];
    expect(refOf(programStateAt(def, enrollment, facts), 'squat', 'top')).toBeCloseTo(100, 2);
  });
});

describe('Madcow skipped top day', () => {
  it('a skipped Monday is neutral: week 5 squat top = week 4 top with no miss count', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { skip: ['mon'] })];
    const state = programStateAt(def, enrollment, facts);
    expect(state.position).toEqual(weekDay(5, 'mon'));
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
    expect(missesOf(state, 'squat:top:endOfWeek')).toBe(0);
  });

  it('a skipped Monday still lets the Wednesday lifts progress: press 50 → 51.25', () => {
    const clock = factClock();
    const facts = [...metMadcowWeeks(clock, [1, 2, 3]), ...madcowWeek(clock, 4, { skip: ['mon'] })];
    expect(refOf(programStateAt(def, enrollment, facts), 'press', 'top')).toBeCloseTo(51.25, 9);
  });

  it('a skipped Monday between two misses does not reset the miss count', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { mondayTopReps: { squat: 4 } }),
      ...madcowWeek(clock, 5, { skip: ['mon'] }),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(missesOf(state, 'squat:top:endOfWeek')).toBe(1);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
  });
});

describe('Madcow stall reset (weeksBack)', () => {
  it('weeksBack(100, 4) is the raw 90.37 (100 × 0.975^4 = 90.3688), not 90', () => {
    const value = weeksBack(100, 4);
    expect(value).toBeCloseTo(90.37, 2);
    expect(value).not.toBe(90);
  });

  it('weeksBack(100, 1) is 97.5', () => {
    expect(weeksBack(100, 1)).toBeCloseTo(97.5, 9);
  });

  it('weeksBack(100, 0) leaves the top at 100', () => {
    expect(weeksBack(100, 0)).toBeCloseTo(100, 9);
  });

  it('weeksBack(102.5, 2) is 97.44 (102.5 × 0.950625 = 97.4391)', () => {
    expect(weeksBack(102.5, 2)).toBeCloseTo(97.44, 2);
  });

  it('a raw set_reference of 90.37 is stored unrounded and the prescribed top rounds to 90', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3, 4]),
      setReferenceFact(clock.next(), 'squat', 'top', weeksBack(100, 4)),
    ];
    const state = programStateAt(def, enrollment, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(90.37, 2);
    expect(weightsOf(resolveDay(state, 5, 'mon'), 'mon-squat')[4]).toBe(90);
  });

  it('the stall-reset top of 90 ramps to 45/57.5/67.5/80/90 (ties up: 56.25 → 57.5, 78.75 → 80)', () => {
    expect(weightsOf(resolveDay(topState({ squat: 90 }), 5, 'mon'), 'mon-squat')).toEqual([45, 57.5, 67.5, 80, 90]);
  });

  it('the raw stall-reset top 90.37 ramps from its rounded top 90 to the same 45/57.5/67.5/80/90', () => {
    expect(weightsOf(resolveDay(topState({ squat: weeksBack(100, 4) }), 5, 'mon'), 'mon-squat')).toEqual([
      45, 57.5, 67.5, 80, 90,
    ]);
  });

  it('progresses 2.5% per met week after a stall reset: 90.37 × 1.025 = 92.629, then × 1.025 = 94.945', () => {
    const clock = factClock();
    const reset = [...metMadcowWeeks(clock, [1, 2, 3, 4]), setReferenceFact(clock.next(), 'squat', 'top', 90.37)];
    const afterWeek5 = programStateAt(def, enrollment, [...reset, ...madcowWeek(clock, 5)]);
    expect(refOf(afterWeek5, 'squat', 'top')).toBeCloseTo(92.629, 3);
    const afterWeek6 = programStateAt(def, enrollment, [...reset, ...metMadcowWeeks(clock, [5, 6])]);
    expect(refOf(afterWeek6, 'squat', 'top')).toBeCloseTo(94.945, 3);
  });

  it('prescribes the post-reset tops rounded: week 6 top 92.63 → 92.5, week 7 top 94.94 → 95', () => {
    const clock = factClock();
    const reset = [...metMadcowWeeks(clock, [1, 2, 3, 4]), setReferenceFact(clock.next(), 'squat', 'top', 90.37)];
    const afterWeek5 = programStateAt(def, enrollment, [...reset, ...madcowWeek(clock, 5)]);
    expect(weightsOf(resolveDay(afterWeek5, 6, 'mon'), 'mon-squat')[4]).toBe(92.5);
    const afterWeek6 = programStateAt(def, enrollment, [...reset, ...metMadcowWeeks(clock, [5, 6])]);
    expect(weightsOf(resolveDay(afterWeek6, 7, 'mon'), 'mon-squat')[4]).toBe(95);
  });

  it('the reset applies to one lift only: bench keeps its 82 top', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3, 4]),
      setReferenceFact(clock.next(), 'squat', 'top', weeksBack(100, 4)),
    ];
    expect(refOf(programStateAt(def, enrollment, facts), 'bench', 'top')).toBeCloseTo(82, 9);
  });
});

describe('Madcow assistance ({lastLogged})', () => {
  const state = topState({ squat: 100, bench: 100, row: 100 });

  it('with no history (or offline) the slot resolves to weightKg null with no snapshot', () => {
    const sets = slotOf(resolveDay(state, 4, 'fri'), 'fri-dip').sets;
    expect(sets).toHaveLength(3);
    expect(sets.map((set) => set.weightKg)).toEqual([null, null, null]);
    expect(sets.map((set) => set.weight)).toEqual([null, null, null]);
    expect(sets.map((set) => set.snapshot)).toEqual([null, null, null]);
  });

  it('with a last set of 30 kg the slot resolves to 30 with no snapshot', () => {
    const resolved = resolveDay(state, 4, 'fri', enrollment, { 'weighted-dip': 30 });
    expect(weightsKgOf(resolved, 'fri-dip')).toEqual([30, 30, 30]);
    expect(slotOf(resolved, 'fri-dip').sets.map((set) => set.snapshot)).toEqual([null, null, null]);
  });

  it('keeps the dip rep range 5–8 and marks assistance optional', () => {
    const sets = slotOf(resolveDay(state, 4, 'fri'), 'fri-dip').sets;
    expect(sets.map((set) => [set.reps, set.maxReps])).toEqual([
      [5, 8],
      [5, 8],
      [5, 8],
    ]);
    expect(sets.every((set) => set.optional)).toBe(true);
    expect(slotOf(resolveDay(state, 4, 'fri'), 'fri-dip').role).toBe('assistance');
  });

  it('prescribes Monday hypers 2 sets and sit-ups 4 sets, Wednesday sit-ups 3 sets', () => {
    expect(slotOf(resolveDay(state, 4, 'mon'), 'mon-hyper').sets).toHaveLength(2);
    expect(slotOf(resolveDay(state, 4, 'mon'), 'mon-situp').sets).toHaveLength(4);
    expect(slotOf(resolveDay(state, 4, 'wed'), 'wed-situp').sets).toHaveLength(3);
  });

  it('prescribes Friday curls 3 sets and triceps extensions 3 × 8', () => {
    expect(slotOf(resolveDay(state, 4, 'fri'), 'fri-curl').sets).toHaveLength(3);
    expect(repsOf(resolveDay(state, 4, 'fri'), 'fri-triceps')).toEqual([8, 8, 8]);
  });

  it('leaves out an assistance exercise that has no binding (missing from the catalog)', () => {
    const unbound = madcowEnrollment({ bindings: { dip: null } });
    expect(slotIdsOf(resolveDay(state, 4, 'fri', unbound))).not.toContain('fri-dip');
  });

  it('logged assistance sets without snapshots never change the fold state', () => {
    const withAssistance = programStateAt(def, enrollment, [
      sessionFact({ id: 'fri-1', at: '2026-10-09T06:00:00.000Z' }, weekDay(1, 'fri'), [
        ...madcowDaySets('fri'),
        unprescribedSet('weighted-dip', 30, 8),
        unprescribedSet('weighted-dip', 30, 8),
      ]),
    ]);
    const withoutAssistance = programStateAt(def, enrollment, [
      sessionFact({ id: 'fri-1', at: '2026-10-09T06:00:00.000Z' }, weekDay(1, 'fri'), madcowDaySets('fri')),
    ]);
    expect(withAssistance).toEqual(withoutAssistance);
  });
});
