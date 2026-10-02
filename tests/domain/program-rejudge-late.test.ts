import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  initialProgramState,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
  type WeeklyPosition,
} from '@domain/index.ts';
import { sessionFact, setReferenceFact } from './program-fixtures/facts.ts';
import {
  LINEAR_AFTER_SESSION,
  linearDay,
  linearEnrollment,
  linearSquatSets,
} from './program-fixtures/linear_after_session.ts';
import { refOf } from './program-fixtures/prescription-helpers.ts';
import {
  kgEnrollment,
  LINEAR_DELOAD_AFTER_SESSION,
  metSets,
  TWO_RULES_ONE_LIFT,
} from './program-fixtures/review-fixtures.ts';

const CLOCK_START_MS = Date.parse('2026-10-05T06:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const NUM_RUNS = 100;

function stampAt(id: string, minute: number) {
  return { id, at: new Date(CLOCK_START_MS + minute * MINUTE_MS).toISOString() };
}

function expectHistoryReplaysToRefs(definition: ProgramDefinition, enrollment: ProgramEnrollment, state: ProgramState) {
  const replayed = structuredClone(initialProgramState(definition, enrollment).refs) as Record<
    string,
    Record<string, number>
  >;
  for (const change of state.history) {
    expect(change.from, `${change.lift}.${change.var} ${change.reason} starts from the current value`).toBeCloseTo(
      replayed[change.lift][change.var],
      9,
    );
    replayed[change.lift][change.var] = change.to;
  }
  expect(replayed).toEqual(state.refs);
}

const deloadLinear = linearEnrollment(100);

const missedA = (id: string, minute: number) =>
  sessionFact(stampAt(id, minute), linearDay(1, 'a'), linearSquatSets('a', 3));
const metA = (id: string, minute: number) => sessionFact(stampAt(id, minute), linearDay(1, 'a'), linearSquatSets('a'));
const metB = (id: string, minute: number) => sessionFact(stampAt(id, minute), linearDay(1, 'b'), linearSquatSets('b'));

describe('a later re-judge of a day keeps the changes made in between', () => {
  it('w1a missed (100 → 90), w1b met (90 → 92.5), then a met w1a ends at 105 (w1a met → 102.5, w1b met → 105)', () => {
    const facts = [missedA('a-missed', 1), metB('b-met', 2), metA('a-met-later', 3)];
    expect(refOf(programStateAt(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, facts), 'squat', 'tm')).toBeCloseTo(105, 9);
  });

  it('records a history that replays to the final refs', () => {
    const facts = [missedA('a-missed', 1), metB('b-met', 2), metA('a-met-later', 3)];
    const state = programStateAt(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, facts);
    expectHistoryReplaysToRefs(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, state);
  });

  it('gives the same refs and history as logging the met w1a in the missed one’s place', () => {
    const rejudged = programStateAt(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, [
      missedA('a-missed', 1),
      metB('b-met', 2),
      metA('a-met-later', 3),
    ]);
    const substituted = programStateAt(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, [metA('a-met', 1), metB('b-met', 2)]);
    expect(rejudged.refs).toEqual(substituted.refs);
    expect(rejudged.history).toEqual(substituted.history);
  });

  describe('with an endOfWeek change in between', () => {
    const definition: ProgramDefinition = {
      ...structuredClone(TWO_RULES_ONE_LIFT),
      progression: [
        structuredClone(TWO_RULES_ONE_LIFT.progression[0]),
        { ...structuredClone(TWO_RULES_ONE_LIFT.progression[1]), onMiss: [{ kind: 'tmReset', pct: 0.1 }] },
      ],
    };
    const enrollment = kgEnrollment('enrollment-two-rules-deload', { squat: { tm: 100 } }, { squat: 'squat' });
    const dayB = (id: string, minute: number, lastReps: number) =>
      sessionFact(stampAt(id, minute), { week: 1, day: 'b' }, metSets('b-squat', 'squat', 3, lastReps));
    const dayA = (id: string, minute: number) =>
      sessionFact(stampAt(id, minute), { week: 1, day: 'a' }, metSets('a-squat', 'squat'));

    it('w1b missed (100 → 90), w1a met ends the week (+5 → 95), then a met w1b ends at 107.5 (102.5, then +5)', () => {
      const facts = [dayB('b-missed', 1, 4), dayA('a-met', 2), dayB('b-met-later', 3, 5)];
      expect(refOf(programStateAt(definition, enrollment, facts), 'squat', 'tm')).toBeCloseTo(107.5, 9);
    });

    it('gives the same refs and history as logging the met w1b in the missed one’s place, and the history replays', () => {
      const rejudged = programStateAt(definition, enrollment, [
        dayB('b-missed', 1, 4),
        dayA('a-met', 2),
        dayB('b-met-later', 3, 5),
      ]);
      const substituted = programStateAt(definition, enrollment, [dayB('b-met', 1, 5), dayA('a-met', 2)]);
      expect(rejudged.refs).toEqual(substituted.refs);
      expect(rejudged.history).toEqual(substituted.history);
      expectHistoryReplaysToRefs(definition, enrollment, rejudged);
    });
  });

  describe('with a set_reference in between', () => {
    it('the set_reference wins from its time on: w1a missed, set 120, then a met w1a ends at 120', () => {
      const facts = [
        missedA('a-missed', 1),
        setReferenceFact(stampAt('reference', 2), 'squat', 'tm', 120),
        metA('a-met-later', 3),
      ];
      expect(refOf(programStateAt(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, facts), 'squat', 'tm')).toBe(120);
    });

    it('applies the re-judged day before the set_reference in fact order: history 100 → 102.5 (increment), 102.5 → 120 (set_reference)', () => {
      const facts = [
        missedA('a-missed', 1),
        setReferenceFact(stampAt('reference', 2), 'squat', 'tm', 120),
        metA('a-met-later', 3),
      ];
      const state = programStateAt(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, facts);
      expect(state.history).toEqual([
        expect.objectContaining({ from: 100, to: expect.closeTo(102.5, 9), reason: 'increment' }),
        expect.objectContaining({ from: expect.closeTo(102.5, 9), to: 120, reason: 'set_reference' }),
      ]);
      expectHistoryReplaysToRefs(LINEAR_DELOAD_AFTER_SESSION, deloadLinear, state);
    });
  });
});

type Intent = { kind: 'session'; position: WeeklyPosition; met: boolean } | { kind: 'reference'; value: number };

const positionArb = fc
  .record({ week: fc.integer({ min: 1, max: 3 }), day: fc.constantFrom('a' as const, 'b' as const) })
  .map(({ week, day }) => linearDay(week, day));

const intentArb: fc.Arbitrary<Intent> = fc.oneof(
  fc.record({ position: positionArb, met: fc.boolean() }).map((value) => ({ kind: 'session' as const, ...value })),
  fc.integer({ min: 30, max: 60 }).map((steps) => ({ kind: 'reference' as const, value: steps * 2.5 })),
);

function sessionAt(id: string, minute: number, position: WeeklyPosition, met: boolean): ProgramFact {
  const day = position.day as 'a' | 'b';
  return sessionFact(stampAt(id, minute), position, linearSquatSets(day, met ? 5 : 3));
}

function samePosition(a: WeeklyPosition, b: WeeklyPosition) {
  return a.week === b.week && a.day === b.day;
}

describe.each([
  ['LINEAR_DELOAD_AFTER_SESSION', LINEAR_DELOAD_AFTER_SESSION],
  ['LINEAR_AFTER_SESSION', LINEAR_AFTER_SESSION],
])('%s: a day missed first and met later folds like that day met in the first one’s place', (_, definition) => {
  it('gives the same refs and history', () => {
    fc.assert(
      fc.property(
        fc.array(intentArb, { minLength: 1, maxLength: 20 }),
        fc.nat(),
        fc.nat(),
        (intents, pickSession, pickLater) => {
          const sessionIndexes = intents.flatMap((intent, index) => (intent.kind === 'session' ? [index] : []));
          fc.pre(sessionIndexes.length > 0);
          const chosenIndex = sessionIndexes[pickSession % sessionIndexes.length];
          const chosen = intents[chosenIndex] as Extract<Intent, { kind: 'session' }>;
          const others = intents.filter(
            (intent, index) =>
              index === chosenIndex || intent.kind !== 'session' || !samePosition(intent.position, chosen.position),
          );
          const chosenAt = others.indexOf(chosen);
          const build = (chosenMet: boolean) =>
            others.map((intent, index) =>
              intent === chosen
                ? sessionAt('chosen', index, chosen.position, chosenMet)
                : intent.kind === 'session'
                  ? sessionAt(`fact-${index}`, index, intent.position, intent.met)
                  : setReferenceFact(stampAt(`fact-${index}`, index), 'squat', 'tm', intent.value),
            );
          const laterMinute = chosenAt + (pickLater % (others.length - chosenAt)) + 0.5;
          const missedThenMet = [...build(false), sessionAt('chosen-met-later', laterMinute, chosen.position, true)];
          const metInPlace = build(true);
          const enrollment = linearEnrollment(100);
          const rejudged = programStateAt(definition, enrollment, missedThenMet);
          const substituted = programStateAt(definition, enrollment, metInPlace);
          expect(rejudged.refs).toEqual(substituted.refs);
          expect(rejudged.history).toEqual(substituted.history);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
