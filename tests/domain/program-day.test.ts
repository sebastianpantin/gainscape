import { describe, expect, it } from 'vitest';
import {
  comparePositions,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
  type ResolvedSlot,
  validateProgramDefinition,
} from '@domain/index.ts';
import { loadProgramTemplates } from '../../scripts/catalog/program-templates.ts';
import { catalogEnrollment } from './program-fixtures/catalog.ts';
import { factClock, sessionFact } from './program-fixtures/facts.ts';
import { type DayLog, followProgram, loggedAsPrescribed, resolveNext } from './program-fixtures/follow.ts';
import { FIVE_THREE_ONE, fiveThreeOneEnrollment } from './program-fixtures/five_three_one.ts';
import { FULL_PRIMITIVES, fullPrimitivesEnrollment } from './program-fixtures/full_primitives.ts';
import { GZCLP, gzclpEnrollment } from './program-fixtures/gzclp.ts';
import { JUGGERNAUT_2, juggernautEnrollment } from './program-fixtures/juggernaut_2.ts';
import { LINEAR_AFTER_SESSION, linearEnrollment } from './program-fixtures/linear_after_session.ts';
import { MADCOW_5X5, madcowEnrollment } from './program-fixtures/madcow_5x5.ts';
import { NSUNS_5DAY, nsunsEnrollment } from './program-fixtures/nsuns_5day.ts';
import { broken, refOf } from './program-fixtures/prescription-helpers.ts';
import { type ProgressionRule, type SlotDecl } from '@domain/program-types.ts';
import { kgEnrollment, STAGED_WEEKLY } from './program-fixtures/review-fixtures.ts';
import { RPE_TOP_SET, rpeEnrollment } from './program-fixtures/rpe_top_set.ts';
import { SMOLOV_JR, smolovJrEnrollment } from './program-fixtures/smolov_jr.ts';
import { STARTING_STRENGTH, startingStrengthEnrollment } from './program-fixtures/starting_strength.ts';
import { STRONGLIFTS_5X5, strongLiftsEnrollment } from './program-fixtures/stronglifts_5x5.ts';
import { TEXAS_METHOD, texasEnrollment } from './program-fixtures/texas_method.ts';

const FOLLOWED_DAYS = 48;

const programs: [string, ProgramDefinition, ProgramEnrollment][] = [
  ['fixture five_three_one', FIVE_THREE_ONE, fiveThreeOneEnrollment()],
  ['fixture full_primitives', FULL_PRIMITIVES, fullPrimitivesEnrollment()],
  ['fixture gzclp', GZCLP, gzclpEnrollment()],
  ['fixture juggernaut_2', JUGGERNAUT_2, juggernautEnrollment()],
  ['fixture linear_after_session', LINEAR_AFTER_SESSION, linearEnrollment()],
  ['fixture madcow_5x5', MADCOW_5X5, madcowEnrollment()],
  ['fixture nsuns_5day', NSUNS_5DAY, nsunsEnrollment()],
  ['fixture rpe_top_set', RPE_TOP_SET, rpeEnrollment()],
  ['fixture smolov_jr', SMOLOV_JR, smolovJrEnrollment()],
  ['fixture starting_strength', STARTING_STRENGTH, startingStrengthEnrollment()],
  ['fixture stronglifts_5x5', STRONGLIFTS_5X5, strongLiftsEnrollment()],
  ['fixture texas_method', TEXAS_METHOD, texasEnrollment()],
  ...loadProgramTemplates().map(({ file, definition }): [string, ProgramDefinition, ProgramEnrollment] => [
    `catalog ${file}`,
    definition,
    catalogEnrollment(definition),
  ]),
];

function requiredOnly(resolved: readonly ResolvedSlot[]): ResolvedSlot[] {
  return resolved.map((slot) =>
    slot.kind === 'exercise' ? { ...slot, sets: slot.sets.filter((set) => !set.optional) } : slot,
  );
}

function dayRecordOf(definition: ProgramDefinition, state: ProgramState, before: ProgramState) {
  return state.days.find(
    (record) => record.epoch === before.epoch && comparePositions(definition, record.position, before.position) === 0,
  );
}

function setbacksWhenFollowed(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  pick: (resolved: readonly ResolvedSlot[]) => readonly ResolvedSlot[],
): string[] {
  const clock = factClock();
  const facts: ProgramFact[] = [];
  const setbacks: string[] = [];
  for (let day = 0; day < FOLLOWED_DAYS; day += 1) {
    const before = programStateAt(definition, enrollment, facts);
    const where = JSON.stringify(before.position);
    facts.push(
      sessionFact(clock.next(), before.position, loggedAsPrescribed(pick(resolveNext(definition, enrollment, before)))),
    );
    const after = programStateAt(definition, enrollment, facts);
    const record = dayRecordOf(definition, after, before);
    if (!record) setbacks.push(`${where} left no day record`);
    const missed = Object.entries(record?.outcomes ?? {}).filter(([, outcome]) => outcome === 'missed');
    setbacks.push(...missed.map(([lift]) => `${where} missed ${lift}`));
    const counted = Object.entries(after.consecutiveMisses).filter(([, misses]) => (misses ?? 0) > 0);
    setbacks.push(...counted.map(([rule]) => `${where} counted a miss for ${rule}`));
    const pending = Object.keys(after.pendingRetests);
    setbacks.push(...pending.map((lift) => `${where} left a retest pending for ${lift}`));
  }
  return [...new Set(setbacks)];
}

describe('a day logged exactly as prescribed is judged met', () => {
  it.each(programs)('%s, every set logged', (_name, definition, enrollment) => {
    expect(setbacksWhenFollowed(definition, enrollment, (resolved) => resolved)).toEqual([]);
  });

  it.each(programs)('%s, optional sets left out', (_name, definition, enrollment) => {
    expect(setbacksWhenFollowed(definition, enrollment, requiredOnly)).toEqual([]);
  });
});

describe('a prescribed retest is judged whatever its rule is scoped to', () => {
  const benchEnrollment = kgEnrollment('enrollment-staged', { bench: { workingWeight: 100 } }, { bench: 'bench' });
  const failedWeeks: DayLog[] = Array.from({ length: 3 }, (): DayLog[] => [{}, { missedLifts: ['bench'] }]).flat();

  it.each([
    ['an after-session rule', () => undefined],
    [
      'an end-of-week rule',
      (copy: ProgramDefinition) => {
        copy.progression[1].trigger = 'endOfWeek';
      },
    ],
    [
      'a rule judged only in the first three weeks',
      (copy: ProgramDefinition) => {
        copy.progression[1].judgedWeeks = [1, 2, 3];
      },
    ],
  ])('%s', (_name, mutate) => {
    const definition = broken(STAGED_WEEKLY, mutate);
    expect(validateProgramDefinition(definition)).toEqual([]);
    const clock = factClock();
    const failed = followProgram(definition, benchEnrollment, clock, failedWeeks);
    expect(failed.state.pendingRetests).toEqual({ bench: 'fiveRm' });

    const retested = followProgram(definition, benchEnrollment, clock, [{}, {}, {}, {}], failed.facts);

    expect(retested.state.pendingRetests).toEqual({});
    expect(retested.state.stages.bench).toBe(0);
    expect(refOf(retested.state, 'bench', 'fiveRm')).toBeGreaterThan(0);
  });
});

describe('the day a Retest is logged', () => {
  const benchEnrollment = kgEnrollment('enrollment-staged', { bench: { workingWeight: 100 } }, { bench: 'bench' });
  const failedWeeks: DayLog[] = Array.from({ length: 3 }, (): DayLog[] => [{}, { missedLifts: ['bench'] }]).flat();
  const extraBench: SlotDecl = {
    id: 'b-extra',
    lift: 'bench',
    role: 'assistance',
    scheme: { kind: 'repeat', count: 1, reps: 5, load: { kind: 'pct', pct: 0.5, of: 'workingWeight' } },
  };

  function retestDay(definition: ProgramDefinition) {
    const clock = factClock();
    const failed = followProgram(definition, benchEnrollment, clock, failedWeeks);
    expect(failed.state.pendingRetests).toEqual({ bench: 'fiveRm' });
    return followProgram(definition, benchEnrollment, clock, [{}, {}], failed.facts).state;
  }

  function withExtraSlot(mutate: (copy: ProgramDefinition) => void): ProgramDefinition {
    const definition = broken(STAGED_WEEKLY, (copy) => {
      copy.schedule.days[1].slots.push(extraBench);
      mutate(copy);
    });
    expect(validateProgramDefinition(definition)).toEqual([]);
    return definition;
  }

  it('does not also judge the Retest rule on its other Slots', () => {
    const control = retestDay(withExtraSlot(() => undefined));
    const state = retestDay(withExtraSlot((copy) => copy.progression[1].judgedSlots.push('b-extra')));

    expect(state.stages).toEqual(control.stages);
    expect(state.consecutiveMisses).toEqual(control.consecutiveMisses);
    expect(state.refs).toEqual(control.refs);
  });

  it('applies the Retest where its rule sits among the after-session rules', () => {
    const ruleBeforeRetest = (onMet: ProgressionRule['onMet']) => (copy: ProgramDefinition) => {
      copy.progression.splice(1, 0, {
        lift: 'bench',
        var: 'workingWeight',
        trigger: 'afterSession',
        judgedSlots: ['b-extra'],
        onMet,
        onMiss: [{ kind: 'hold' }],
      });
    };
    const control = retestDay(withExtraSlot(ruleBeforeRetest([{ kind: 'hold' }])));
    const state = retestDay(withExtraSlot(ruleBeforeRetest([{ kind: 'increment', by: { kg: 5, lb: 10 } }])));

    expect(refOf(state, 'bench', 'workingWeight')).toBe(refOf(control, 'bench', 'workingWeight'));
  });
});

describe('a required set the device cannot snapshot is not judged', () => {
  it.each([
    ['a last-logged load', { reps: 5, load: { kind: 'lastLogged' } }],
    ['open reps', { reps: null, load: { kind: 'pct', pct: 0.5, of: 'tm' } }],
  ] as const)('%s', (_name, unsnapshotted) => {
    const definition = broken(LINEAR_AFTER_SESSION, (copy) => {
      copy.schedule.days[0].slots[0].scheme = {
        kind: 'sets',
        sets: [{ reps: 5, load: { kind: 'pct', pct: 1, of: 'tm' } }, unsnapshotted],
      };
    });
    expect(validateProgramDefinition(definition)).toEqual([]);

    const { state } = followProgram(definition, linearEnrollment(), factClock(), [{}, {}, {}]);

    expect(state.days.map((day) => day.outcomes)).toEqual([{ squat: 'met' }, { squat: 'met' }, { squat: 'met' }]);
    expect(refOf(state, 'squat', 'tm')).toBe(107.5);
  });
});

describe('a rule whose judged sets are not prescribed that day is neutral', () => {
  it('does not raise the reference for a day of zero reps', () => {
    const definition = broken(STAGED_WEEKLY, (copy) => {
      copy.progression[0].judgedSetIndexes = [7];
    });
    expect(validateProgramDefinition(definition)).toEqual([]);
    const enrollment = kgEnrollment('enrollment-staged', { bench: { workingWeight: 100 } }, { bench: 'bench' });
    const zeroReps = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`a-bench:${index}`, 0]));

    const { state } = followProgram(definition, enrollment, factClock(), [{ reps: zeroReps }, {}]);

    expect(state.days[0].outcomes).toEqual({ bench: 'neutral' });
    expect(refOf(state, 'bench', 'workingWeight')).toBe(100);
  });
});
