import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type FactSet,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
} from '@domain/index.ts';
import { jumpToFact, sessionFact, setReferenceFact, skipDayFact } from './program-fixtures/facts.ts';
import {
  cyclePosition,
  FIVE_THREE_ONE,
  FIVE_THREE_ONE_LIFTS,
  fiveThreeOneEnrollment,
  mainSets531,
} from './program-fixtures/five_three_one.ts';
import {
  MADCOW_5X5,
  MADCOW_DAYS,
  madcowDaySets,
  madcowEnrollment,
  type MadcowDay,
  weekDay,
} from './program-fixtures/madcow_5x5.ts';

const CLOCK_START_MS = Date.parse('2026-10-05T06:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const NUM_RUNS = 60;
const DAY_SHIFT_MS = 24 * 60 * MINUTE_MS;

type Intent =
  | { kind: 'session'; position: Position; repsRoll: number[] }
  | { kind: 'skip'; position: Position }
  | { kind: 'reference'; lift: string; value: number }
  | { kind: 'jump'; position: Position }
  | { kind: 'copy'; of: number };

interface Scenario {
  name: string;
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  positionArb: fc.Arbitrary<Position>;
  referenceLifts: readonly string[];
  referenceVar: 'tm' | 'top';
  setsFor(position: Position, repsRoll: number[]): FactSet[];
  orderOf(position: Position): number[];
}

const madcowScenario: Scenario = {
  name: 'Madcow (weekly)',
  definition: MADCOW_5X5,
  enrollment: madcowEnrollment(),
  positionArb: fc
    .record({ week: fc.integer({ min: 1, max: 8 }), day: fc.constantFrom(...MADCOW_DAYS) })
    .map(({ week, day }) => weekDay(week, day)),
  referenceLifts: ['squat', 'bench', 'press'],
  referenceVar: 'top',
  setsFor(position, repsRoll) {
    const day = (position as { day: MadcowDay }).day;
    return madcowDaySets(day, {
      mondayTopReps: { squat: repsRoll[0], bench: repsRoll[1], row: repsRoll[2] },
      wednesdayTopReps: { press: repsRoll[0], deadlift: repsRoll[1] },
      fridayTripleReps: { squat: repsRoll[2] },
    });
  },
  orderOf(position) {
    const { week, day } = position as { week: number; day: MadcowDay };
    return [week, MADCOW_DAYS.indexOf(day)];
  },
};

const fiveThreeOneScenario: Scenario = {
  name: '5/3/1 (cycle)',
  definition: FIVE_THREE_ONE,
  enrollment: fiveThreeOneEnrollment(),
  positionArb: fc
    .record({
      cycle: fc.integer({ min: 1, max: 2 }),
      week: fc.integer({ min: 1, max: 4 }),
      day: fc.constantFrom(...FIVE_THREE_ONE_LIFTS),
    })
    .map(({ cycle, week, day }) => cyclePosition(cycle, week, day)),
  referenceLifts: ['squat', 'bench'],
  referenceVar: 'tm',
  setsFor(position, repsRoll) {
    const { week, day } = position as { week: number; day: (typeof FIVE_THREE_ONE_LIFTS)[number] };
    return mainSets531(day, week, repsRoll[0] + 1);
  },
  orderOf(position) {
    const { cycle, week, day } = position as {
      cycle: number;
      week: number;
      day: (typeof FIVE_THREE_ONE_LIFTS)[number];
    };
    return [cycle, week, FIVE_THREE_ONE_LIFTS.indexOf(day)];
  },
};

function intentArb(scenario: Scenario, withCopies: boolean): fc.Arbitrary<Intent> {
  const options: fc.Arbitrary<Intent>[] = [
    fc
      .record({
        position: scenario.positionArb,
        repsRoll: fc.array(fc.integer({ min: 3, max: 5 }), { minLength: 3, maxLength: 3 }),
      })
      .map((value) => ({ kind: 'session' as const, ...value })),
    fc
      .record({ position: scenario.positionArb, repsRoll: fc.constant<number[]>([5, 5, 5]) })
      .map((value) => ({ kind: 'session' as const, ...value })),
    scenario.positionArb.map((position) => ({ kind: 'skip' as const, position })),
    scenario.positionArb.map((position) => ({ kind: 'jump' as const, position })),
    fc
      .record({ lift: fc.constantFrom(...scenario.referenceLifts), steps: fc.integer({ min: 24, max: 60 }) })
      .map(({ lift, steps }) => ({ kind: 'reference' as const, lift, value: steps * 2.5 })),
  ];
  if (withCopies) options.push(fc.nat({ max: 50 }).map((of) => ({ kind: 'copy' as const, of })));
  return fc.oneof(...options);
}

function intentsArb(scenario: Scenario, withCopies: boolean): fc.Arbitrary<Intent[]> {
  return fc.array(intentArb(scenario, withCopies), { minLength: 1, maxLength: 30 });
}

function buildFacts(scenario: Scenario, intents: readonly Intent[], startMs = CLOCK_START_MS): ProgramFact[] {
  const facts: ProgramFact[] = [];
  intents.forEach((intent, index) => {
    if (intent.kind === 'copy') {
      if (facts.length > 0) facts.push(facts[intent.of % facts.length]);
      return;
    }
    const stamp = {
      id: `fact-${String(index).padStart(4, '0')}`,
      at: new Date(startMs + index * MINUTE_MS).toISOString(),
    };
    if (intent.kind === 'session')
      facts.push(sessionFact(stamp, intent.position, scenario.setsFor(intent.position, intent.repsRoll)));
    if (intent.kind === 'skip') facts.push(skipDayFact(stamp, intent.position));
    if (intent.kind === 'jump') facts.push(jumpToFact(stamp, intent.position));
    if (intent.kind === 'reference')
      facts.push(setReferenceFact(stamp, intent.lift, scenario.referenceVar, intent.value));
  });
  return facts;
}

function serverOrder(facts: readonly ProgramFact[]): ProgramFact[] {
  return [...facts].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
}

function compareOrder(a: number[], b: number[]): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function withoutFactIds(state: ProgramState) {
  return {
    position: state.position,
    completedDays: state.completedDays,
    refs: state.refs,
    consecutiveMisses: state.consecutiveMisses,
    days: state.days,
    history: state.history,
  };
}

describe.each([madcowScenario, fiveThreeOneScenario])('programStateAt properties over $name facts', (scenario) => {
  const fold = (facts: readonly ProgramFact[]) => programStateAt(scenario.definition, scenario.enrollment, facts);

  it('(a) any permutation of the facts gives the same state as the server-ordered list', () => {
    fc.assert(
      fc.property(
        intentsArb(scenario, true).chain((intents) => {
          const facts = buildFacts(scenario, intents);
          return fc.tuple(
            fc.constant(facts),
            fc.shuffledSubarray(facts, { minLength: facts.length, maxLength: facts.length }),
          );
        }),
        ([facts, shuffled]) => {
          expect(fold(shuffled)).toEqual(fold(serverOrder(facts)));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('(b) duplicating a fact changes nothing', () => {
    fc.assert(
      fc.property(intentsArb(scenario, true), fc.nat(), fc.nat(), (intents, pick, insertAt) => {
        const facts = buildFacts(scenario, intents);
        fc.pre(facts.length > 0);
        const duplicated = [...facts];
        duplicated.splice(insertAt % (facts.length + 1), 0, facts[pick % facts.length]);
        expect(fold(duplicated)).toEqual(fold(facts));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('(c) the position never decreases across server-ordered prefixes, except where a jump_to sets it', () => {
    fc.assert(
      fc.property(intentsArb(scenario, true), (intents) => {
        const ordered = serverOrder(buildFacts(scenario, intents));
        let previous = scenario.orderOf(fold([]).position);
        for (let length = 1; length <= ordered.length; length += 1) {
          const current = scenario.orderOf(fold(ordered.slice(0, length)).position);
          if (ordered[length - 1].kind !== 'jump_to') expect(compareOrder(previous, current)).toBeLessThanOrEqual(0);
          previous = current;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('(d) removing a session is the same as never logging it, even at different timestamps and ids', () => {
    fc.assert(
      fc.property(intentsArb(scenario, false), fc.nat(), (intents, pick) => {
        const sessionIndexes = intents.flatMap((intent, index) => (intent.kind === 'session' ? [index] : []));
        fc.pre(sessionIndexes.length > 0);
        const removedIndex = sessionIndexes[pick % sessionIndexes.length];
        const removedId = `fact-${String(removedIndex).padStart(4, '0')}`;
        const loggedThenRemoved = buildFacts(scenario, intents).filter((fact) => fact.id !== removedId);
        const remainingIntents = intents.filter((_, index) => index !== removedIndex);
        const neverLoggedLater = buildFacts(scenario, remainingIntents, CLOCK_START_MS + DAY_SHIFT_MS);
        const folded = withoutFactIds(fold(loggedThenRemoved));
        expect(neverLoggedLater.every((fact) => !loggedThenRemoved.some((kept) => kept.at === fact.at))).toBe(true);
        expect(folded).toEqual(withoutFactIds(fold(buildFacts(scenario, remainingIntents))));
        expect(folded).toEqual(withoutFactIds(fold(neverLoggedLater)));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
