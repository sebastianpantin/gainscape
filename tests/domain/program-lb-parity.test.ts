import { describe, expect, it } from 'vitest';
import { programStateAt, resolvePrescription } from '@domain/index.ts';
import { shownWeight } from '../../web/src/lib/units.ts';
import { factClock } from './program-fixtures/facts.ts';
import {
  cyclePosition,
  cycleSessions,
  FIVE_THREE_ONE,
  fiveThreeOneEnrollment,
} from './program-fixtures/five_three_one.ts';
import { MADCOW_5X5, madcowEnrollment, weekDay } from './program-fixtures/madcow_5x5.ts';
import { refOf, refsState, slotOf, weightsKgOf, weightsOf } from './program-fixtures/prescription-helpers.ts';

const lb531 = fiveThreeOneEnrollment({
  unit: 'lb',
  tms: { squat: 300, bench: 200, deadlift: 400, press: 135 },
});

describe('5/3/1 in lb', () => {
  const resolveSquatWeekOne = () =>
    resolvePrescription(FIVE_THREE_ONE, lb531, refsState({ squat: { tm: 300 } }), cyclePosition(1, 1, 'squat'), {});

  it('squat TM 300 lb week 1 is 195/225/255 lb (300 × 0.65/0.75/0.85)', () => {
    expect(weightsOf(resolveSquatWeekOne(), 'squat-main')).toEqual([195, 225, 255]);
  });

  it('emits the week 1 sets as 88.45/102.06/115.67 kg', () => {
    expect(weightsKgOf(resolveSquatWeekOne(), 'squat-main')).toEqual([88.45, 102.06, 115.67]);
  });

  it('snapshots the kg weights', () => {
    expect(slotOf(resolveSquatWeekOne(), 'squat-main').sets.map((set) => set.snapshot?.weightKg)).toEqual([
      88.45, 102.06, 115.67,
    ]);
  });

  it('shownWeight shows the emitted kg as 195/225/255 lb', () => {
    expect(weightsKgOf(resolveSquatWeekOne(), 'squat-main').map((kg) => shownWeight(kg!, 'lb'))).toEqual([
      195, 225, 255,
    ]);
  });

  it('rounds to 5 lb: bench TM 200 lb week 1 is 130/150/170 (200 × 0.65/0.75/0.85)', () => {
    const bench = resolvePrescription(
      FIVE_THREE_ONE,
      lb531,
      refsState({ bench: { tm: 200 } }),
      cyclePosition(1, 1, 'bench'),
      {},
    );
    expect(weightsOf(bench, 'bench-main')).toEqual([130, 150, 170]);
  });

  it('rounds to the nearest 5 lb: press TM 135 lb week 1 is 90/100/115 (87.75 → 90, 101.25 → 100, 114.75 → 115)', () => {
    const press = resolvePrescription(
      FIVE_THREE_ONE,
      lb531,
      refsState({ press: { tm: 135 } }),
      cyclePosition(1, 1, 'press'),
      {},
    );
    expect(weightsOf(press, 'press-main')).toEqual([90, 100, 115]);
  });

  it('rounds 5 lb ties up: squat TM 150 lb week 1 is 100/115/130 (97.5/112.5/127.5 are exact ties)', () => {
    const squat = resolvePrescription(
      FIVE_THREE_ONE,
      lb531,
      refsState({ squat: { tm: 150 } }),
      cyclePosition(1, 1, 'squat'),
      {},
    );
    expect(weightsOf(squat, 'squat-main')).toEqual([100, 115, 130]);
  });

  it('floors at the 45 lb bar: press TM 60 lb week 4 is 45/45/45 (24/30/36 → 25/30/35 → 45)', () => {
    const press = resolvePrescription(
      FIVE_THREE_ONE,
      lb531,
      refsState({ press: { tm: 60 } }),
      cyclePosition(1, 4, 'press'),
      {},
    );
    expect(weightsOf(press, 'press-main')).toEqual([45, 45, 45]);
  });

  it('a full cycle takes squat 300 → 310 lb and bench 200 → 205 lb', () => {
    const state = programStateAt(FIVE_THREE_ONE, lb531, cycleSessions(factClock(), 1));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(310, 9);
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(205, 9);
    expect(refOf(state, 'deadlift', 'tm')).toBeCloseTo(410, 9);
    expect(refOf(state, 'press', 'tm')).toBeCloseTo(140, 9);
  });

  it('keeps an lb TM in lb: 1RM 315 lb × 0.9 = 283.5 lb unrounded', () => {
    const enrollment = fiveThreeOneEnrollment({ unit: 'lb', oneRms: { squat: 315 } });
    const state = programStateAt(FIVE_THREE_ONE, enrollment, []);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(283.5, 9);
  });

  it('BBB at 50% of TM 300 lb is 5 × 10 @ 150 lb (68.04 kg)', () => {
    expect(weightsOf(resolveSquatWeekOne(), 'squat-bbb')).toEqual([150, 150, 150, 150, 150]);
    expect(weightsKgOf(resolveSquatWeekOne(), 'squat-bbb')).toEqual([68.04, 68.04, 68.04, 68.04, 68.04]);
  });
});

describe('Madcow in lb', () => {
  const enrollment = madcowEnrollment({ unit: 'lb', fiveRms: { bench: 200 } });
  const state = refsState({ bench: { top: 200 } });

  it('bench 5RM 200 lb week 4 Monday is 100/125/150/175/200 lb', () => {
    const resolved = resolvePrescription(MADCOW_5X5, enrollment, state, weekDay(4, 'mon'), {});
    expect(weightsOf(resolved, 'mon-bench')).toEqual([100, 125, 150, 175, 200]);
  });

  it('emits week 4 Monday as 45.36/56.7/68.04/79.38/90.72 kg', () => {
    const resolved = resolvePrescription(MADCOW_5X5, enrollment, state, weekDay(4, 'mon'), {});
    expect(weightsKgOf(resolved, 'mon-bench')).toEqual([45.36, 56.7, 68.04, 79.38, 90.72]);
  });

  it('the week 4 Friday triple is 205 lb (200 × 1.025), emitted as 92.99 kg', () => {
    const resolved = resolvePrescription(MADCOW_5X5, enrollment, state, weekDay(4, 'fri'), {});
    expect(weightsOf(resolved, 'fri-bench')).toEqual([100, 125, 150, 175, 205, 150]);
    expect(weightsKgOf(resolved, 'fri-bench')[4]).toBe(92.99);
  });

  it('shownWeight shows the Friday triple as 205 lb', () => {
    const resolved = resolvePrescription(MADCOW_5X5, enrollment, state, weekDay(4, 'fri'), {});
    expect(shownWeight(weightsKgOf(resolved, 'fri-bench')[4]!, 'lb')).toBe(205);
  });

  it('starts bench 5RM 200 lb at a raw week 1 top of 185.37 lb (200 × 0.975^3) that rounds to 185', () => {
    const fresh = programStateAt(MADCOW_5X5, enrollment, []);
    expect(refOf(fresh, 'bench', 'top')).toBeCloseTo(185.37, 2);
    const resolved = resolvePrescription(MADCOW_5X5, enrollment, fresh, weekDay(1, 'mon'), {});
    expect(weightsOf(resolved, 'mon-bench')[4]).toBe(185);
  });

  it('keeps a last-logged kg weight as kg for an lb enrollment: 30 kg dips stay 30 kg', () => {
    const resolved = resolvePrescription(MADCOW_5X5, enrollment, state, weekDay(4, 'fri'), { 'weighted-dip': 30 });
    expect(weightsKgOf(resolved, 'fri-dip')).toEqual([30, 30, 30]);
  });

  it('displays a last-logged 30 kg in lb as shownWeight(30, lb) = 66.1', () => {
    const resolved = resolvePrescription(MADCOW_5X5, enrollment, state, weekDay(4, 'fri'), { 'weighted-dip': 30 });
    expect(weightsOf(resolved, 'fri-dip')).toEqual([
      shownWeight(30, 'lb'),
      shownWeight(30, 'lb'),
      shownWeight(30, 'lb'),
    ]);
    expect(shownWeight(30, 'lb')).toBe(66.1);
  });
});
