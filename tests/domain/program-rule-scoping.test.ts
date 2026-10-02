import { describe, expect, it } from 'vitest';
import { initialProgramState, programStateAt } from '@domain/index.ts';
import { factClock, sessionFact } from './program-fixtures/facts.ts';
import { MADCOW_5X5, madcowEnrollment } from './program-fixtures/madcow_5x5.ts';
import { missesOf, refOf } from './program-fixtures/prescription-helpers.ts';
import {
  kgEnrollment,
  metSets,
  TWO_RULES_ONE_LIFT,
  UNSUPPORTED_JUDGED_SCHEMES,
} from './program-fixtures/review-fixtures.ts';

const twoRules = kgEnrollment('enrollment-two-rules', { squat: { tm: 100 } }, { squat: 'squat' });

describe('outcomes are judged per progression rule, not per lift', () => {
  it('a met day A does not fire the after-session rule that judges day B: squat stays 100 mid-week', () => {
    const clock = factClock();
    const facts = [sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-squat', 'squat'))];
    expect(refOf(programStateAt(TWO_RULES_ONE_LIFT, twoRules, facts), 'squat', 'tm')).toBe(100);
  });

  it('a missed day B does not hold the weekly rule that judges day A: A met gives +5, B missed holds, so 100 → 105', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-squat', 'squat')),
      sessionFact(clock.next(), { week: 1, day: 'b' }, metSets('b-squat', 'squat', 3, 4)),
    ];
    expect(refOf(programStateAt(TWO_RULES_ONE_LIFT, twoRules, facts), 'squat', 'tm')).toBeCloseTo(105, 9);
  });

  it('both rules met in a week apply each increment once: 100 + 5 (weekly) + 2.5 (after session) = 107.5', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-squat', 'squat')),
      sessionFact(clock.next(), { week: 1, day: 'b' }, metSets('b-squat', 'squat')),
    ];
    expect(refOf(programStateAt(TWO_RULES_ONE_LIFT, twoRules, facts), 'squat', 'tm')).toBeCloseTo(107.5, 9);
  });
});

describe('a judged slot whose scheme cannot be resolved is neutral', () => {
  const enrollment = kgEnrollment(
    'enrollment-unsupported-schemes',
    { bench: { tm: 100 }, squat: { tm: 100 } },
    { bench: 'bench', squat: 'squat' },
  );

  it('logged sets on a stages slot neither miss nor deload: bench stays 100 with no miss', () => {
    const clock = factClock();
    const facts = [sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-bench', 'bench', 5, 3))];
    const state = programStateAt(UNSUPPORTED_JUDGED_SCHEMES, enrollment, facts);
    expect(refOf(state, 'bench', 'tm')).toBe(100);
    expect(missesOf(state, 'bench:tm:afterSession')).toBe(0);
  });

  it('logged sets on a week table with no row for week 2 neither miss nor deload: squat stays 100 with no miss', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), { week: 1, day: 'a' }, []),
      sessionFact(clock.next(), { week: 2, day: 'a' }, metSets('a-squat', 'squat')),
    ];
    const state = programStateAt(UNSUPPORTED_JUDGED_SCHEMES, enrollment, facts);
    expect(refOf(state, 'squat', 'tm')).toBe(100);
    expect(missesOf(state, 'squat:tm:afterSession')).toBe(0);
  });

  it('records the unresolvable slot outcome as neutral on the day record', () => {
    const clock = factClock();
    const facts = [sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-bench', 'bench', 5, 3))];
    const [record] = programStateAt(UNSUPPORTED_JUDGED_SCHEMES, enrollment, facts).days;
    expect(record.outcomes.bench ?? 'neutral').toBe('neutral');
  });
});

describe('consecutiveMisses is kept per rule, keyed lift:var:trigger', () => {
  it('starts every rule of a lift at 0 under its own key', () => {
    expect(initialProgramState(TWO_RULES_ONE_LIFT, twoRules).consecutiveMisses).toEqual({
      'squat:tm:endOfWeek': 0,
      'squat:tm:afterSession': 0,
    });
  });

  it('keys Madcow counters by lift, var and trigger', () => {
    expect(Object.keys(initialProgramState(MADCOW_5X5, madcowEnrollment()).consecutiveMisses).sort()).toEqual([
      'bench:top:endOfWeek',
      'deadlift:top:endOfWeek',
      'press:top:endOfWeek',
      'row:top:endOfWeek',
      'squat:top:endOfWeek',
    ]);
  });

  it('a met after-session day does not reset the weekly rule miss: A missed, B met gives endOfWeek 1, afterSession 0', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-squat', 'squat', 3, 4)),
      sessionFact(clock.next(), { week: 1, day: 'b' }, metSets('b-squat', 'squat')),
    ];
    const state = programStateAt(TWO_RULES_ONE_LIFT, twoRules, facts);
    expect(missesOf(state, 'squat:tm:endOfWeek')).toBe(1);
    expect(missesOf(state, 'squat:tm:afterSession')).toBe(0);
  });

  it('each rule counts its own misses: B missed twice and A missed once give afterSession 2, endOfWeek 1', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-squat', 'squat')),
      sessionFact(clock.next(), { week: 1, day: 'b' }, metSets('b-squat', 'squat', 3, 4)),
      sessionFact(clock.next(), { week: 2, day: 'a' }, metSets('a-squat', 'squat', 3, 4)),
      sessionFact(clock.next(), { week: 2, day: 'b' }, metSets('b-squat', 'squat', 3, 4)),
    ];
    const state = programStateAt(TWO_RULES_ONE_LIFT, twoRules, facts);
    expect(missesOf(state, 'squat:tm:afterSession')).toBe(2);
    expect(missesOf(state, 'squat:tm:endOfWeek')).toBe(1);
  });
});
