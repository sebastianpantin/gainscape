import { describe, expect, it } from 'vitest';
import { programStateAt } from '@domain/index.ts';
import { factClock, jumpToFact } from './program-fixtures/facts.ts';
import {
  cyclePosition,
  cycleSessions,
  FIVE_THREE_ONE,
  fiveThreeOneEnrollment,
} from './program-fixtures/five_three_one.ts';
import { MADCOW_5X5, madcowEnrollment, madcowWeek, weekDay } from './program-fixtures/madcow_5x5.ts';
import { missesOf, refOf } from './program-fixtures/prescription-helpers.ts';

describe('each jump_to starts a new epoch: older records are neither merged nor judged', () => {
  const madcow = madcowEnrollment();

  it('a repeated Madcow week 1 after a backward jump is judged only on the repeat: a missed repeat Monday holds squat at 95.06', () => {
    const clock = factClock();
    const facts = [
      ...madcowWeek(clock, 1),
      jumpToFact(clock.next(), weekDay(1, 'mon')),
      ...madcowWeek(clock, 1, { mondayTopReps: { squat: 4 } }),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(95.06, 2);
    expect(missesOf(state, 'squat:top:endOfWeek')).toBe(1);
  });

  it('the repeated week still progresses the lifts met in the repeat: bench 76.05 → 78 (÷ 0.975)', () => {
    const clock = factClock();
    const facts = [
      ...madcowWeek(clock, 1),
      jumpToFact(clock.next(), weekDay(1, 'mon')),
      ...madcowWeek(clock, 1, { mondayTopReps: { squat: 4 } }),
    ];
    expect(refOf(programStateAt(MADCOW_5X5, madcow, facts), 'bench', 'top')).toBeCloseTo(78, 9);
  });

  it('records the repeat Monday squat outcome as missed, not merged with the met first attempt', () => {
    const clock = factClock();
    const facts = [
      ...madcowWeek(clock, 1),
      jumpToFact(clock.next(), weekDay(1, 'mon')),
      ...madcowWeek(clock, 1, { mondayTopReps: { squat: 4 } }),
    ];
    const mondayOutcomes = programStateAt(MADCOW_5X5, madcow, facts)
      .days.filter(
        (record) =>
          'week' in record.position &&
          record.position.week === 1 &&
          'day' in record.position &&
          record.position.day === 'mon',
      )
      .map((record) => record.outcomes.squat);
    expect(mondayOutcomes.at(-1)).toBe('missed');
  });

  it('5/3/1 applies the cycle-end rule once per completed pass and judges the repeat alone: a repeat-pass squat miss resets 145 → 130.5 while bench goes 102.5 → 105', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1),
      jumpToFact(clock.next(), cyclePosition(1, 1, 'squat')),
      ...cycleSessions(clock, 1, { lastSetReps: { 'squat@1': 4 } }),
    ];
    const state = programStateAt(FIVE_THREE_ONE, fiveThreeOneEnrollment(), facts);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(130.5, 9);
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(105, 9);
    expect(state.position).toEqual(cyclePosition(2, 1, 'squat'));
  });
});
