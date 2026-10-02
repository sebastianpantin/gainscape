import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUNDING,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
  type ReferenceVar,
} from '@domain/index.ts';
import { factClock, jumpToFact, sessionFact, setReferenceFact, skipDayFact } from './program-fixtures/facts.ts';
import {
  cyclePosition,
  FIVE_THREE_ONE,
  fiveThreeOneEnrollment,
  mainSets531,
} from './program-fixtures/five_three_one.ts';
import { GZCLP_SHAPE } from './program-fixtures/gzclp.ts';
import { MADCOW_5X5, madcowDaySets, madcowEnrollment, weekDay } from './program-fixtures/madcow_5x5.ts';

const FOLD_BUDGET_MS = 3000;
const TIMED_OUT = 'fold did not finish within the time budget';

function foldWithinBudget(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  facts: ProgramFact[],
): Promise<ProgramState | typeof TIMED_OUT> {
  const startedAt = performance.now();
  const state = programStateAt(definition, enrollment, facts);
  return Promise.resolve(performance.now() - startedAt > FOLD_BUDGET_MS ? TIMED_OUT : state);
}

function comparable(state: ProgramState | typeof TIMED_OUT) {
  if (state === TIMED_OUT) return state;
  return {
    position: state.position,
    completedDays: state.completedDays,
    refs: state.refs,
    consecutiveMisses: state.consecutiveMisses,
    days: state.days,
    history: state.history,
  };
}

async function expectIgnored(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  valid: ProgramFact[],
  extra: ProgramFact,
) {
  const withExtra = await foldWithinBudget(definition, enrollment, [...valid, extra]);
  expect(comparable(withExtra)).toEqual(comparable(programStateAt(definition, enrollment, valid)));
}

const fiveThreeOne = fiveThreeOneEnrollment();
const madcow = madcowEnrollment();
const gzclp: ProgramEnrollment = {
  id: 'enrollment-gzclp',
  unit: 'kg',
  options: {},
  bindings: Object.fromEntries(GZCLP_SHAPE.lifts.map((lift) => [lift.key, lift.key])),
  inputs: Object.fromEntries(GZCLP_SHAPE.lifts.map((lift) => [lift.key, { workingWeight: 60 }])),
  rounding: DEFAULT_ROUNDING.kg,
};

function validFiveThreeOneStart(clock: ReturnType<typeof factClock>): ProgramFact[] {
  return [sessionFact(clock.next(), cyclePosition(1, 1, 'squat'), mainSets531('squat', 1))];
}

function validMadcowStart(clock: ReturnType<typeof factClock>): ProgramFact[] {
  return [sessionFact(clock.next(), weekDay(1, 'mon'), madcowDaySets('mon'))];
}

const INVALID_CYCLE_POSITIONS: [string, Position][] = [
  ['cycle 1e6', { cycle: 1e6, week: 1, day: 'squat' }],
  ['week 5 beyond the 4 weeks per cycle', { cycle: 1, week: 5, day: 'squat' }],
  ['unknown day key tuesday', { cycle: 1, week: 1, day: 'tuesday' }],
  ['cycle 0', { cycle: 0, week: 1, day: 'squat' }],
  ['week 0', { cycle: 1, week: 0, day: 'squat' }],
  ['negative week', { cycle: 1, week: -2, day: 'squat' }],
  ['fractional cycle 1.5', { cycle: 1.5, week: 1, day: 'squat' }],
  ['a weekly position on a cycle schedule', { week: 2, day: 'squat' }],
  ['a rotation index on a cycle schedule', { index: 3 }],
];

const INVALID_WEEKLY_POSITIONS: [string, Position][] = [
  ['week 1e6', { week: 1e6, day: 'mon' }],
  ['negative week', { week: -3, day: 'mon' }],
  ['week 0', { week: 0, day: 'mon' }],
  ['fractional week 2.5', { week: 2.5, day: 'mon' }],
  ['unknown day key tue', { week: 1, day: 'tue' }],
];

const INVALID_ROTATION_POSITIONS: [string, Position][] = [
  ['negative index', { index: -1 }],
  ['fractional index 1.5', { index: 1.5 }],
  ['index 1e6', { index: 1e6 }],
  ['a weekly position on a rotation schedule', { week: 1, day: 'a1' }],
];

describe('the timed fold harness', () => {
  it('folds valid facts to the same state as an untimed fold', async () => {
    const clock = factClock();
    const facts = [...validMadcowStart(clock), setReferenceFact(clock.next(), 'squat', 'top', 90)];
    expect(comparable(await foldWithinBudget(MADCOW_5X5, madcow, facts))).toEqual(
      comparable(programStateAt(MADCOW_5X5, madcow, facts)),
    );
  });
});

describe('facts at invalid positions are ignored quickly and change nothing', () => {
  describe.each(INVALID_CYCLE_POSITIONS)('5/3/1 position with %s', (_, position) => {
    it('ignores a session there', async () => {
      const clock = factClock();
      await expectIgnored(
        FIVE_THREE_ONE,
        fiveThreeOne,
        validFiveThreeOneStart(clock),
        sessionFact(clock.next(), position, mainSets531('squat', 1)),
      );
    });

    it('ignores a skip_day there', async () => {
      const clock = factClock();
      await expectIgnored(
        FIVE_THREE_ONE,
        fiveThreeOne,
        validFiveThreeOneStart(clock),
        skipDayFact(clock.next(), position),
      );
    });

    it('ignores a jump_to there', async () => {
      const clock = factClock();
      await expectIgnored(
        FIVE_THREE_ONE,
        fiveThreeOne,
        validFiveThreeOneStart(clock),
        jumpToFact(clock.next(), position),
      );
    });
  });

  describe.each(INVALID_WEEKLY_POSITIONS)('Madcow position with %s', (_, position) => {
    it('ignores a session there', async () => {
      const clock = factClock();
      await expectIgnored(
        MADCOW_5X5,
        madcow,
        validMadcowStart(clock),
        sessionFact(clock.next(), position, madcowDaySets('mon')),
      );
    });

    it('ignores a skip_day there', async () => {
      const clock = factClock();
      await expectIgnored(MADCOW_5X5, madcow, validMadcowStart(clock), skipDayFact(clock.next(), position));
    });

    it('ignores a jump_to there', async () => {
      const clock = factClock();
      await expectIgnored(MADCOW_5X5, madcow, validMadcowStart(clock), jumpToFact(clock.next(), position));
    });
  });

  describe.each(INVALID_ROTATION_POSITIONS)('GZCLP rotation position with %s', (_, position) => {
    it('ignores a session there', async () => {
      const clock = factClock();
      await expectIgnored(GZCLP_SHAPE, gzclp, [], sessionFact(clock.next(), position, []));
    });

    it('ignores a jump_to there', async () => {
      const clock = factClock();
      await expectIgnored(GZCLP_SHAPE, gzclp, [], jumpToFact(clock.next(), position));
    });
  });
});

const INVALID_REFERENCES: [string, string, ReferenceVar, number][] = [
  ['an unknown lift', 'clean', 'tm', 100],
  ['a var the template does not declare', 'squat', 'e1rm', 150],
  ['NaN', 'squat', 'tm', Number.NaN],
  ['zero', 'squat', 'tm', 0],
  ['a negative value', 'squat', 'tm', -5],
  ['Infinity', 'squat', 'tm', Number.POSITIVE_INFINITY],
];

describe('set_reference facts with an invalid target or value are ignored', () => {
  it.each(INVALID_REFERENCES)('ignores a set_reference with %s', async (_, lift, variable, value) => {
    const clock = factClock();
    await expectIgnored(
      FIVE_THREE_ONE,
      fiveThreeOne,
      validFiveThreeOneStart(clock),
      setReferenceFact(clock.next(), lift, variable, value),
    );
  });
});

describe('set_reference facts for a lift that takes no input are ignored', () => {
  it('ignores a Madcow top reference for the weighted hyperextension', async () => {
    const clock = factClock();
    await expectIgnored(
      MADCOW_5X5,
      madcow,
      validMadcowStart(clock),
      setReferenceFact(clock.next(), 'hyper', 'top', 40),
    );
  });
});
