import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  parseProgramDefinition,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
  type ResolvedSlot,
} from '@domain/index.ts';
import { firstPosition, upcomingDays } from '@domain/program-schedule.ts';
import { validateEnrollment } from '@domain/program-validate.ts';
import { factClock, sessionFact } from './program-fixtures/facts.ts';
import { type LoggedEffort, loggedAsPrescribed, resolveAt, resolveNext } from './program-fixtures/follow.ts';
import { enrollmentFor, generatedDefinition } from './program-fixtures/generated-definitions.ts';

const NUM_RUNS = 500;
const TIMEOUT_MS = 20_000;
const FOLLOWED_WEEKS = 5;
const KEPT_SET_PATTERN_LENGTH = 16;

type PickSets = (resolved: readonly ResolvedSlot[]) => ResolvedSlot[];

function weekPositions(definition: ProgramDefinition): Position[] {
  const start = { position: firstPosition(definition), completedDays: [] };
  return upcomingDays(definition, start, FOLLOWED_WEEKS * definition.schedule.days.length);
}

function unsupportedAt(position: Position, resolved: readonly ResolvedSlot[]): string[] {
  return resolved.flatMap((slot) =>
    slot.kind === 'unsupported' ? [`${JSON.stringify(position)} ${slot.slotId}: unsupported ${slot.primitive}`] : [],
  );
}

function unsupportedDays(definition: ProgramDefinition, enrollment: ProgramEnrollment, state: ProgramState): string[] {
  return weekPositions(definition).flatMap((position) =>
    unsupportedAt(position, resolveAt(definition, enrollment, state, position)),
  );
}

function effortsOnEverySet(resolved: readonly ResolvedSlot[]): Record<string, LoggedEffort> {
  return Object.fromEntries(
    resolved.flatMap((slot) =>
      slot.kind === 'exercise' ? slot.sets.map((set) => [set.ref, { type: 'rpe', value: 8 }]) : [],
    ),
  );
}

function unsupportedWhenFollowed(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  pick: PickSets,
): string[] {
  const clock = factClock();
  const facts: ProgramFact[] = [];
  const start = programStateAt(definition, enrollment, facts);
  const unsupported = unsupportedDays(definition, enrollment, start);
  for (let day = 0; day < FOLLOWED_WEEKS * definition.schedule.days.length; day += 1) {
    const state = programStateAt(definition, enrollment, facts);
    const resolved = resolveNext(definition, enrollment, state);
    unsupported.push(...unsupportedAt(state.position, resolved));
    const sets = loggedAsPrescribed(pick(resolved), { efforts: effortsOnEverySet(resolved) });
    facts.push(sessionFact(clock.next(), state.position, sets));
  }
  const end = programStateAt(definition, enrollment, facts);
  return [...new Set([...unsupported, ...unsupportedDays(definition, enrollment, end)])];
}

function keepingSome(pattern: readonly boolean[]): PickSets {
  let seen = 0;
  return (resolved) =>
    resolved.map((slot) => {
      if (slot.kind !== 'exercise') return slot;
      return { ...slot, sets: slot.sets.filter(() => pattern[seen++ % pattern.length]) };
    });
}

const acceptedProgram = generatedDefinition
  .map((definition) => parseProgramDefinition(JSON.parse(JSON.stringify(definition))))
  .chain((parsed) =>
    parsed.kind === 'ok'
      ? enrollmentFor(parsed.definition).map((enrollment) => ({ definition: parsed.definition, enrollment }))
      : fc.constant(null),
  );

const GENERATED_PRIMITIVES: readonly string[] = [
  'cycle',
  'weekly',
  'rotation',
  'sets',
  'repeat',
  'weekTable',
  'stages',
  'pct',
  'ramp',
  'sameAs',
  'weekTablePct',
  'lastLogged',
  'pctOfSet',
  'pctOfSlot',
  'rpeLoad',
  'cumulativeAddOn',
  'increment',
  'hold',
  'tmReset',
  'failureCounter',
  'stageMachine',
  'retest',
  'resetToFirstStage',
  'amrapThreshold',
  'amrapTable',
  'repsOverStandard',
  'e1rmFromSet',
  'afterSession',
  'endOfWeek',
  'endOfCycle',
  'endOfWave',
];
const COVERAGE_SEED = 197;
const COVERAGE_SAMPLES = 1000;

function kindsAndTriggersIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(kindsAndTriggersIn);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    (key === 'kind' || key === 'trigger') && typeof inner === 'string' ? [inner] : kindsAndTriggersIn(inner),
  );
}

describe('the generated definitions', () => {
  it('include accepted ones that use every primitive the engine supports', () => {
    const accepted = fc.sample(acceptedProgram, { seed: COVERAGE_SEED, numRuns: COVERAGE_SAMPLES });
    const used = new Set(accepted.flatMap((program) => kindsAndTriggersIn(program?.definition)));

    expect(GENERATED_PRIMITIVES.filter((primitive) => !used.has(primitive))).toEqual([]);
    expect(accepted.filter((program) => program !== null).length).toBeGreaterThan(COVERAGE_SAMPLES / 4);
  });
});

describe('the engine can run every definition the validator accepts', () => {
  it(
    'prescribes every day with no unsupported slot and judges it without throwing, logged in full or in part',
    () => {
      fc.assert(
        fc.property(
          acceptedProgram,
          fc.array(fc.boolean(), { minLength: KEPT_SET_PATTERN_LENGTH, maxLength: KEPT_SET_PATTERN_LENGTH }),
          (program, keptSets) => {
            fc.pre(program !== null);
            const { definition, enrollment } = program;
            expect(validateEnrollment(definition, enrollment)).toEqual([]);

            expect(unsupportedWhenFollowed(definition, enrollment, (resolved) => [...resolved])).toEqual([]);
            expect(unsupportedWhenFollowed(definition, enrollment, keepingSome(keptSets))).toEqual([]);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    TIMEOUT_MS,
  );
});
