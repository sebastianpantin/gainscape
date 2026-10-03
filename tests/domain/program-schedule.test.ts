import { describe, expect, it } from 'vitest';
import {
  availableDays,
  comparePositions,
  firstPosition,
  isPositionInSchedule,
  nextPosition,
  programStateAt,
  upcomingDays,
} from '@domain/index.ts';
import { factClock, sessionFact, skipDayFact } from './program-fixtures/facts.ts';
import {
  cyclePosition,
  cycleSessions,
  FIVE_THREE_ONE,
  fiveThreeOneEnrollment,
} from './program-fixtures/five_three_one.ts';
import { GZCLP } from './program-fixtures/gzclp.ts';
import { MADCOW_5X5, madcowDaySets, madcowEnrollment, madcowWeek, weekDay } from './program-fixtures/madcow_5x5.ts';

const madcow = madcowEnrollment();
const fiveThreeOne = fiveThreeOneEnrollment();

describe('firstPosition', () => {
  it('starts a cycle schedule at cycle 1, week 1, first day', () => {
    expect(firstPosition(FIVE_THREE_ONE)).toEqual(cyclePosition(1, 1, 'squat'));
  });

  it('starts a weekly schedule at week 1, first day', () => {
    expect(firstPosition(MADCOW_5X5)).toEqual(weekDay(1, 'mon'));
  });
});

describe('nextPosition (schedule order)', () => {
  it.each([
    [cyclePosition(1, 1, 'squat'), cyclePosition(1, 1, 'bench')],
    [cyclePosition(1, 1, 'press'), cyclePosition(1, 2, 'squat')],
    [cyclePosition(1, 3, 'deadlift'), cyclePosition(1, 3, 'press')],
    [cyclePosition(1, 4, 'press'), cyclePosition(2, 1, 'squat')],
    [cyclePosition(7, 4, 'press'), cyclePosition(8, 1, 'squat')],
  ])('cycle: after %j comes %j', (position, expected) => {
    expect(nextPosition(FIVE_THREE_ONE, position)).toEqual(expected);
  });

  it.each([
    [weekDay(1, 'mon'), weekDay(1, 'wed')],
    [weekDay(1, 'wed'), weekDay(1, 'fri')],
    [weekDay(1, 'fri'), weekDay(2, 'mon')],
    [weekDay(52, 'fri'), weekDay(53, 'mon')],
  ])('weekly: after %j comes %j with an unbounded week', (position, expected) => {
    expect(nextPosition(MADCOW_5X5, position)).toEqual(expected);
  });
});

describe('comparePositions', () => {
  it('orders cycle positions by cycle, then week, then day order', () => {
    expect(comparePositions(FIVE_THREE_ONE, cyclePosition(1, 4, 'press'), cyclePosition(2, 1, 'squat'))).toBeLessThan(
      0,
    );
    expect(
      comparePositions(FIVE_THREE_ONE, cyclePosition(1, 2, 'squat'), cyclePosition(1, 1, 'press')),
    ).toBeGreaterThan(0);
    expect(
      comparePositions(FIVE_THREE_ONE, cyclePosition(1, 1, 'bench'), cyclePosition(1, 1, 'deadlift')),
    ).toBeLessThan(0);
  });

  it('orders weekly positions by week, then day order', () => {
    expect(comparePositions(MADCOW_5X5, weekDay(1, 'fri'), weekDay(2, 'mon'))).toBeLessThan(0);
    expect(comparePositions(MADCOW_5X5, weekDay(3, 'wed'), weekDay(3, 'mon'))).toBeGreaterThan(0);
  });

  it('is zero for equal positions', () => {
    expect(comparePositions(MADCOW_5X5, weekDay(3, 'wed'), weekDay(3, 'wed'))).toBe(0);
  });
});

describe('day order within the current week is free', () => {
  it('logging Friday first keeps Monday as the next suggested day', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, [
      sessionFact(clock.next(), weekDay(1, 'fri'), madcowDaySets('fri')),
    ]);
    expect(state.position).toEqual(weekDay(1, 'mon'));
    expect(state.completedDays).toEqual(['fri']);
  });

  it('keeps completedDays sorted in schedule order whatever the logging order', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, madcowWeek(clock, 1, { order: ['fri', 'mon'] }));
    expect(state.completedDays).toEqual(['mon', 'fri']);
    expect(state.position).toEqual(weekDay(1, 'wed'));
  });

  it('a week logged Friday, Wednesday, Monday still rolls over to week 2 with nothing completed', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, madcowWeek(clock, 1, { order: ['fri', 'wed', 'mon'] }));
    expect(state.position).toEqual(weekDay(2, 'mon'));
    expect(state.completedDays).toEqual([]);
  });

  it('a skipped day counts as done for the suggestion: skipping Monday suggests Wednesday', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, [skipDayFact(clock.next(), weekDay(1, 'mon'))]);
    expect(state.position).toEqual(weekDay(1, 'wed'));
    expect(state.completedDays).toEqual(['mon']);
  });

  it('a 5/3/1 week logged out of order completes the week once all four lifts are done', () => {
    const clock = factClock();
    const facts = cycleSessions(clock, 1, { weeks: [1], lifts: ['press', 'bench', 'deadlift', 'squat'] });
    expect(programStateAt(FIVE_THREE_ONE, fiveThreeOne, facts).position).toEqual(cyclePosition(1, 2, 'squat'));
  });
});

describe('availableDays (day picker)', () => {
  it('offers every day of the week at the start of a week', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, madcowWeek(clock, 1));
    expect(availableDays(MADCOW_5X5, state)).toEqual([weekDay(2, 'mon'), weekDay(2, 'wed'), weekDay(2, 'fri')]);
  });

  it('offers only the not-yet-completed days of the current week, in schedule order', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, [
      sessionFact(clock.next(), weekDay(1, 'wed'), madcowDaySets('wed')),
    ]);
    expect(availableDays(MADCOW_5X5, state)).toEqual([weekDay(1, 'mon'), weekDay(1, 'fri')]);
  });

  it('offers the remaining 5/3/1 lifts of the current week', () => {
    const clock = factClock();
    const state = programStateAt(
      FIVE_THREE_ONE,
      fiveThreeOne,
      cycleSessions(clock, 1, { weeks: [1], lifts: ['bench'] }),
    );
    expect(availableDays(FIVE_THREE_ONE, state)).toEqual([
      cyclePosition(1, 1, 'squat'),
      cyclePosition(1, 1, 'deadlift'),
      cyclePosition(1, 1, 'press'),
    ]);
  });
});

describe('upcomingDays', () => {
  it('lists the uncompleted days of the current week, then the next weeks, in schedule order', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, madcowWeek(clock, 1, { order: ['mon', 'fri'] }));
    expect(upcomingDays(MADCOW_5X5, state, 3)).toEqual([weekDay(1, 'wed'), weekDay(2, 'mon'), weekDay(2, 'wed')]);
  });

  it('crosses a cycle boundary', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1, { weeks: [1, 2, 3] }),
      ...cycleSessions(clock, 1, { weeks: [4], lifts: ['squat', 'bench'] }),
    ];
    const state = programStateAt(FIVE_THREE_ONE, fiveThreeOne, facts);
    expect(upcomingDays(FIVE_THREE_ONE, state, 3)).toEqual([
      cyclePosition(1, 4, 'deadlift'),
      cyclePosition(1, 4, 'press'),
      cyclePosition(2, 1, 'squat'),
    ]);
  });

  it('returns an empty list for a count of 0', () => {
    expect(upcomingDays(MADCOW_5X5, programStateAt(MADCOW_5X5, madcow, []), 0)).toEqual([]);
  });

  it('starts from the first day of a fresh enrollment', () => {
    expect(upcomingDays(MADCOW_5X5, programStateAt(MADCOW_5X5, madcow, []), 4)).toEqual([
      weekDay(1, 'mon'),
      weekDay(1, 'wed'),
      weekDay(1, 'fri'),
      weekDay(2, 'mon'),
    ]);
  });
});

describe('isPositionInSchedule bounds every schedule to 520 weeks', () => {
  it.each([
    [{ cycle: 130, week: 4, day: 'press' }, true],
    [{ cycle: 131, week: 1, day: 'squat' }, false],
  ])('5/3/1 with four-week cycles takes %o: %s', (position, accepted) => {
    expect(isPositionInSchedule(FIVE_THREE_ONE, position)).toBe(accepted);
  });

  it.each([
    [{ week: 520, day: 'fri' }, true],
    [{ week: 521, day: 'mon' }, false],
  ])('weekly Madcow takes %o: %s', (position, accepted) => {
    expect(isPositionInSchedule(MADCOW_5X5, position)).toBe(accepted);
  });

  it.each([
    [{ index: 0 }, true],
    [{ index: 2079 }, true],
    [{ index: 2080 }, false],
  ])('the four-day GZCLP rotation takes %o: %s, so the index stays below 520 x 4', (position, accepted) => {
    expect(isPositionInSchedule(GZCLP, position)).toBe(accepted);
  });
});
