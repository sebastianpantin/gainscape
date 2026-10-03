import { describe, expect, it } from 'vitest';
import { type Position, type ProgramFact, programStateAt } from '@domain/index.ts';
import { dayChoices } from '../../web/src/lib/program-today-rules.ts';
import { skipDayEvent, skipDialogTitle, skipLabel } from '../../web/src/lib/program-skip-rules.ts';
import { factClock, sessionFact, skipDayFact } from '../domain/program-fixtures/facts.ts';
import { cyclePosition, FIVE_THREE_ONE } from '../domain/program-fixtures/five_three_one.ts';
import { MADCOW_5X5, madcowDaySets, madcowEnrollment, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';

function choiceLabelsAfter(facts: ProgramFact[]) {
  return dayChoices(MADCOW_5X5, programStateAt(MADCOW_5X5, madcowEnrollment(), facts)).map((choice) => [
    choice.label,
    choice.suggested,
  ]);
}

function skippedAs(stamp: { id: string; at: string }, position: Position): ProgramFact {
  return skipDayFact(stamp, skipDayEvent(position).position);
}

describe('skip day labels', () => {
  it('names the action after the picked day: "Skip W1 Day 1"', () => {
    expect(skipLabel(MADCOW_5X5, weekDay(1, 'mon'))).toBe('Skip W1 Day 1');
  });

  it('names a 5/3/1 day with its cycle: "Skip C1 W2 Day 3"', () => {
    expect(skipLabel(FIVE_THREE_ONE, cyclePosition(1, 2, 'deadlift'))).toBe('Skip C1 W2 Day 3');
  });

  it('asks in the confirm dialog title: "Skip W1 Day 2?"', () => {
    expect(skipDialogTitle(MADCOW_5X5, weekDay(1, 'wed'))).toBe('Skip W1 Day 2?');
  });
});

describe('skip day event', () => {
  it('sends adjust_enrollment a skip_day for the picked position', () => {
    expect(skipDayEvent(weekDay(1, 'mon'))).toEqual({ kind: 'skip_day', position: { week: 1, day: 'mon' } });
  });

  it('sends a cycle position whole: cycle, week and day', () => {
    expect(skipDayEvent(cyclePosition(2, 3, 'press'))).toEqual({
      kind: 'skip_day',
      position: { cycle: 2, week: 3, day: 'press' },
    });
  });

  it('takes the skipped Day 1 out of the day picker and suggests Day 2 next', () => {
    expect(choiceLabelsAfter([skippedAs(factClock().next(), weekDay(1, 'mon'))])).toEqual([
      ['W1 Day 2', true],
      ['W1 Day 3', false],
    ]);
  });

  it('skipping the last open day of the week moves the picker to week 2 Day 1', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), weekDay(1, 'mon'), madcowDaySets('mon')),
      sessionFact(clock.next(), weekDay(1, 'wed'), madcowDaySets('wed')),
      skippedAs(clock.next(), weekDay(1, 'fri')),
    ];
    expect(choiceLabelsAfter(facts)[0]).toEqual(['W2 Day 1', true]);
  });
});
