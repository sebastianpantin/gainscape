import { describe, expect, it } from 'vitest';
import { programStateAt } from '@domain/index.ts';
import { factClock, sessionFact } from './program-fixtures/facts.ts';
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
    expect(missesOf(state, 'bench')).toBe(0);
  });

  it('logged sets on a week table with no row for week 2 neither miss nor deload: squat stays 100 with no miss', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), { week: 1, day: 'a' }, []),
      sessionFact(clock.next(), { week: 2, day: 'a' }, metSets('a-squat', 'squat')),
    ];
    const state = programStateAt(UNSUPPORTED_JUDGED_SCHEMES, enrollment, facts);
    expect(refOf(state, 'squat', 'tm')).toBe(100);
    expect(missesOf(state, 'squat')).toBe(0);
  });

  it('records the unresolvable slot outcome as neutral on the day record', () => {
    const clock = factClock();
    const facts = [sessionFact(clock.next(), { week: 1, day: 'a' }, metSets('a-bench', 'bench', 5, 3))];
    const [record] = programStateAt(UNSUPPORTED_JUDGED_SCHEMES, enrollment, facts).days;
    expect(record.outcomes.bench ?? 'neutral').toBe('neutral');
  });
});
