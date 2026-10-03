import { describe, expect, it } from 'vitest';
import {
  initialProgramState,
  parseProgramDefinition,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  validateEnrollment,
  validateProgramDefinition,
} from '@domain/index.ts';
import { FIVE_THREE_ONE, fiveThreeOneEnrollment } from './program-fixtures/five_three_one.ts';
import { resolveAt } from './program-fixtures/follow.ts';
import { GZCLP, gzclpEnrollment } from './program-fixtures/gzclp.ts';
import { JUGGERNAUT_2, juggernautEnrollment } from './program-fixtures/juggernaut_2.ts';
import { MADCOW_5X5, madcowEnrollment } from './program-fixtures/madcow_5x5.ts';
import { NSUNS_5DAY, nsunsEnrollment } from './program-fixtures/nsuns_5day.ts';
import { RPE_TOP_SET, rpeEnrollment } from './program-fixtures/rpe_top_set.ts';
import { SMOLOV_JR, smolovJrEnrollment } from './program-fixtures/smolov_jr.ts';
import { STARTING_STRENGTH, startingStrengthEnrollment } from './program-fixtures/starting_strength.ts';
import { STRONGLIFTS_5X5, strongLiftsEnrollment } from './program-fixtures/stronglifts_5x5.ts';
import { TEXAS_METHOD, texasEnrollment } from './program-fixtures/texas_method.ts';

interface KeptProgram {
  name: string;
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
}

const KEPT_PROGRAMS: readonly KeptProgram[] = [
  { name: 'five_three_one', definition: FIVE_THREE_ONE, enrollment: fiveThreeOneEnrollment() },
  {
    name: 'five_three_one with FSL',
    definition: FIVE_THREE_ONE,
    enrollment: fiveThreeOneEnrollment({ options: { supplemental: 'fsl' } }),
  },
  { name: 'madcow_5x5', definition: MADCOW_5X5, enrollment: madcowEnrollment() },
  { name: 'juggernaut_2', definition: JUGGERNAUT_2, enrollment: juggernautEnrollment() },
  {
    name: 'juggernaut_2 in lb with fine',
    definition: JUGGERNAUT_2,
    enrollment: juggernautEnrollment({ unit: 'lb', options: { perRep: 'fine' } }),
  },
  { name: 'stronglifts_5x5', definition: STRONGLIFTS_5X5, enrollment: strongLiftsEnrollment() },
  { name: 'starting_strength', definition: STARTING_STRENGTH, enrollment: startingStrengthEnrollment() },
  { name: 'gzclp', definition: GZCLP, enrollment: gzclpEnrollment() },
  { name: 'nsuns_5day', definition: NSUNS_5DAY, enrollment: nsunsEnrollment() },
  { name: 'texas_method', definition: TEXAS_METHOD, enrollment: texasEnrollment() },
  {
    name: 'texas_method with ohp',
    definition: TEXAS_METHOD,
    enrollment: texasEnrollment({ options: { pressLift: 'ohp' } }),
  },
  { name: 'smolov_jr', definition: SMOLOV_JR, enrollment: smolovJrEnrollment() },
  { name: 'rpe_top_set with fatigue back-offs', definition: RPE_TOP_SET, enrollment: rpeEnrollment() },
  {
    name: 'rpe_top_set with fixed back-offs',
    definition: RPE_TOP_SET,
    enrollment: rpeEnrollment({ options: { backoff: 'fixed' } }),
  },
];

function fullScheduleOf(definition: ProgramDefinition): Position[] {
  const schedule = definition.schedule;
  const dayKeys = schedule.days.map((day) => day.key);
  switch (schedule.kind) {
    case 'cycle':
      return Array.from({ length: schedule.weeksPerCycle }, (_, index) => index + 1).flatMap((week) =>
        dayKeys.map((day) => ({ cycle: 1, week, day })),
      );
    case 'weekly':
      return dayKeys.map((day) => ({ week: 1, day }));
    case 'rotation':
      return dayKeys.map((_, index) => ({ index }));
  }
}

describe.each(KEPT_PROGRAMS)('expressiveness gate: $name', ({ definition, enrollment }) => {
  it('validates with no errors', () => {
    expect(validateProgramDefinition(definition)).toEqual([]);
  });

  it('accepts its own fixture enrollment', () => {
    expect(validateEnrollment(definition, enrollment)).toEqual([]);
  });

  it('parses from JSON as ok, with no unknown or unsupported kinds', () => {
    expect(parseProgramDefinition(JSON.parse(JSON.stringify(definition)))).toEqual({ kind: 'ok', definition });
  });

  it('resolves every day of a full week, cycle or rotation with no unsupported results', () => {
    const start = initialProgramState(definition, enrollment);
    const unsupported = fullScheduleOf(definition).flatMap((position) =>
      resolveAt(definition, enrollment, start, position)
        .filter((slot) => slot.kind === 'unsupported')
        .map((slot) => ({ position, slot })),
    );
    expect(unsupported).toEqual([]);
  });

  it('prescribes a weight for every set except last-logged assistance with no history', () => {
    const start = initialProgramState(definition, enrollment);
    const missing = fullScheduleOf(definition).flatMap((position) =>
      resolveAt(definition, enrollment, start, position).flatMap((slot) =>
        slot.kind === 'exercise' && slot.role !== 'assistance'
          ? slot.sets.filter((set) => set.weight === null).map((set) => ({ position, ref: set.ref }))
          : [],
      ),
    );
    expect(missing).toEqual([]);
  });
});
