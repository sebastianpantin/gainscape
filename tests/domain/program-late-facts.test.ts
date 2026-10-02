import { describe, expect, it } from 'vitest';
import { type CyclePosition, programStateAt } from '@domain/index.ts';
import { factClock, sessionFact, skipDayFact } from './program-fixtures/facts.ts';
import { refOf } from './program-fixtures/prescription-helpers.ts';
import { kgEnrollment, metSets, WEEK_AND_CYCLE_RULES } from './program-fixtures/review-fixtures.ts';

const enrollment = kgEnrollment(
  'enrollment-week-and-cycle',
  { squat: { tm: 100 }, bench: { tm: 100 } },
  {
    squat: 'squat',
    bench: 'bench',
  },
);

function at(cycle: number, week: number, day: 'a' | 'b'): CyclePosition {
  return { cycle, week, day };
}

function dayASets(squatLastReps: number, benchLastReps: number) {
  return [...metSets('a-squat', 'squat', 3, squatLastReps), ...metSets('a-bench', 'bench', 3, benchLastReps)];
}

function cycleOneWithSkippedWeekOneDayA(clock: ReturnType<typeof factClock>) {
  return [
    skipDayFact(clock.next(), at(1, 1, 'a')),
    sessionFact(clock.next(), at(1, 1, 'b'), metSets('b-squat', 'squat')),
  ];
}

describe('a late session for a past week within the same cycle', () => {
  it('does not re-run the fired week 1 endOfWeek: a late met week 1 bench leaves bench at 100 before week 2 ends', () => {
    const clock = factClock();
    const facts = [...cycleOneWithSkippedWeekOneDayA(clock), sessionFact(clock.next(), at(1, 1, 'a'), dayASets(5, 5))];
    const state = programStateAt(WEEK_AND_CYCLE_RULES, enrollment, facts);
    expect(state.position).toEqual(at(1, 2, 'a'));
    expect(refOf(state, 'bench', 'top')).toBe(100);
  });

  it('is seen by the pending endOfCycle: a late missed week 1 squat resets squat 100 → 90 at cycle end, while bench only gets week 2: 100 → 102.5', () => {
    const clock = factClock();
    const facts = [
      ...cycleOneWithSkippedWeekOneDayA(clock),
      sessionFact(clock.next(), at(1, 1, 'a'), dayASets(4, 5)),
      sessionFact(clock.next(), at(1, 2, 'a'), dayASets(5, 5)),
      sessionFact(clock.next(), at(1, 2, 'b'), metSets('b-squat', 'squat')),
    ];
    const state = programStateAt(WEEK_AND_CYCLE_RULES, enrollment, facts);
    expect(state.position).toEqual(at(2, 1, 'a'));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(90, 9);
    expect(refOf(state, 'bench', 'top')).toBeCloseTo(102.5, 9);
  });

  it('changes nothing once that cycle end has fired: a late missed cycle 1 squat leaves squat 105 and bench 102.5', () => {
    const clock = factClock();
    const completedCycle = [
      ...cycleOneWithSkippedWeekOneDayA(clock),
      sessionFact(clock.next(), at(1, 2, 'a'), dayASets(5, 5)),
      sessionFact(clock.next(), at(1, 2, 'b'), metSets('b-squat', 'squat')),
    ];
    const before = programStateAt(WEEK_AND_CYCLE_RULES, enrollment, completedCycle);
    const after = programStateAt(WEEK_AND_CYCLE_RULES, enrollment, [
      ...completedCycle,
      sessionFact(clock.next(), at(1, 1, 'a'), dayASets(4, 5)),
    ]);
    expect(refOf(before, 'squat', 'tm')).toBeCloseTo(105, 9);
    expect(refOf(after, 'squat', 'tm')).toBeCloseTo(105, 9);
    expect(refOf(after, 'bench', 'top')).toBeCloseTo(102.5, 9);
    expect(after.position).toEqual(before.position);
    expect(after.history).toEqual(before.history);
  });
});
