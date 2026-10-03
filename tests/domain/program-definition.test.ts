import { describe, expect, it } from 'vitest';
import {
  type Adjustment,
  parseProgramDefinition,
  type ProgramDefinition,
  resolvePrescription,
  type SetListScheme,
  validateProgramDefinition,
} from '@domain/index.ts';
import { FIVE_THREE_ONE, fiveThreeOneEnrollment } from './program-fixtures/five_three_one.ts';
import {
  FULL_PRIMITIVES,
  fullPrimitivesEnrollment,
  SLICE_1B_PRIMITIVES_BY_SLOT,
} from './program-fixtures/full_primitives.ts';
import { GZCLP } from './program-fixtures/gzclp.ts';
import { LINEAR_AFTER_SESSION } from './program-fixtures/linear_after_session.ts';
import { MADCOW_5X5 } from './program-fixtures/madcow_5x5.ts';
import { refsState, slotOf, weightsOf } from './program-fixtures/prescription-helpers.ts';

const FIXTURES: [string, ProgramDefinition][] = [
  ['five_three_one', FIVE_THREE_ONE],
  ['madcow_5x5', MADCOW_5X5],
  ['gzclp (shape only)', GZCLP],
  ['synthetic after-session linear', LINEAR_AFTER_SESSION],
  ['synthetic full primitive set', FULL_PRIMITIVES],
];

const FULLY_SUPPORTED_FIXTURES: [string, ProgramDefinition][] = [
  ['five_three_one', FIVE_THREE_ONE],
  ['madcow_5x5', MADCOW_5X5],
  ['synthetic after-session linear', LINEAR_AFTER_SESSION],
];

const SLICE_1B_ADJUSTMENTS: [string, Adjustment][] = [
  ['failureCounter', { kind: 'failureCounter', threshold: 3, deloadPct: 0.1 }],
  ['stageMachine', { kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85 } }],
  ['amrapThreshold', { kind: 'amrapThreshold', setIndex: 2, reps: 25 }],
  ['amrapTable', { kind: 'amrapTable', setIndex: 2, bands: [[2, { kg: 2.5, lb: 5 }]] }],
  [
    'repsOverStandard',
    { kind: 'repsOverStandard', setIndex: 2, standardByWave: [10], perRep: { kg: 2.5, lb: 5 }, cap: 10 },
  ],
  ['e1rmFromSet', { kind: 'e1rmFromSet', setIndex: 2 }],
  ['customRule', { kind: 'customRule', name: 'synthetic' }],
];

function namedUnsupportedKinds(parsed: ReturnType<typeof parseProgramDefinition>): string[] {
  const lists = parsed as { unknownKinds?: string[]; unsupportedKinds?: string[] };
  return [...(lists.unknownKinds ?? []), ...(lists.unsupportedKinds ?? [])];
}

function broken(definition: ProgramDefinition, mutate: (copy: ProgramDefinition) => void): ProgramDefinition {
  const copy = structuredClone(definition);
  mutate(copy);
  return copy;
}

function madcowDay(copy: ProgramDefinition, dayKey: string) {
  const day = copy.schedule.days.find((candidate) => candidate.key === dayKey);
  expect(day).toBeDefined();
  return day!;
}

function asJson(definition: ProgramDefinition): unknown {
  return JSON.parse(JSON.stringify(definition));
}

describe('validateProgramDefinition accepts', () => {
  it.each(FIXTURES)('the %s fixture', (_, definition) => {
    expect(validateProgramDefinition(definition)).toEqual([]);
  });
});

describe('validateProgramDefinition rejects with a readable error', () => {
  it('a sameAs ref to a set index that does not exist (mon-squat:9)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      const scheme = madcowDay(copy, 'wed').slots[0].scheme as SetListScheme;
      scheme.sets[3] = { reps: 5, load: { kind: 'sameAs', ref: 'mon-squat:9' } };
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('mon-squat:9')]),
    );
  });

  it('a sameAs ref to a slot that does not exist (mon-front-squat:0)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      const scheme = madcowDay(copy, 'wed').slots[0].scheme as SetListScheme;
      scheme.sets[0] = { reps: 5, load: { kind: 'sameAs', ref: 'mon-front-squat:0' } };
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('mon-front-squat:0')]),
    );
  });

  it('a load of an undeclared reference var (fiveRm in 5/3/1, which declares only tm)', () => {
    const definition = broken(FIVE_THREE_ONE, (copy) => {
      copy.schedule.days[0].slots[0].scheme = { kind: 'weekTable', table: 'main', of: 'fiveRm' };
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('fiveRm')]));
  });

  it('an unknown option in a load (rampJump)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      madcowDay(copy, 'mon').slots[0].scheme = {
        kind: 'repeat',
        count: 5,
        reps: 5,
        load: { kind: 'ramp', step: { option: 'rampJump' }, count: 5, of: 'top' },
      };
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('rampJump')]),
    );
  });

  it('an unknown option in a slot condition (assistancePlan)', () => {
    const definition = broken(FIVE_THREE_ONE, (copy) => {
      copy.schedule.days[0].slots[1].when = [{ option: 'assistancePlan', equals: 'bbb' }];
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('assistancePlan')]),
    );
  });

  it('an unknown week table (mainWave)', () => {
    const definition = broken(FIVE_THREE_ONE, (copy) => {
      copy.schedule.days[0].slots[0].scheme = { kind: 'weekTable', table: 'mainWave', of: 'tm' };
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('mainWave')]),
    );
  });

  it('a week table with fewer rows than weeks per cycle', () => {
    const definition = broken(FIVE_THREE_ONE, (copy) => {
      copy.weekTables = { main: copy.weekTables!.main.slice(0, 3) };
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('main')]));
  });

  it('a slot bound to an undeclared lift (hack-squat)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      madcowDay(copy, 'mon').slots[0].lift = 'hack-squat';
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('hack-squat')]),
    );
  });

  it('a progression rule judging an unknown slot (mon-squats)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.progression[0].judgedSlots = ['mon-squats'];
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('mon-squats')]),
    );
  });

  it('a progression rule for an undeclared lift (clean)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.progression[0].lift = 'clean';
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('clean')]));
  });

  it('a progression rule on an undeclared var (e1rm in Madcow)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.progression[0].var = 'e1rm';
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('e1rm')]));
  });

  it('a duplicate slot id (mon-squat twice)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      madcowDay(copy, 'mon').slots[1].id = 'mon-squat';
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('mon-squat')]),
    );
  });

  it('a duplicate day key (mon twice)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.schedule.days[1].key = 'mon';
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('mon')]));
  });

  it('an initial expression for an undeclared var (workingWeight in Madcow)', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.initial = [{ kind: 'copy', var: 'workingWeight', from: 'fiveRm' }];
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('workingWeight')]),
    );
  });

  it('an option default outside its choices (bbbPct 0.65)', () => {
    const definition = broken(FIVE_THREE_ONE, (copy) => {
      const option = copy.options.find((candidate) => candidate.key === 'bbbPct');
      expect(option).toBeDefined();
      option!.default = 0.65;
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('bbbPct')]));
  });

  it('a pctOfSlot load naming an unknown day (thursday)', () => {
    const definition = broken(FULL_PRIMITIVES, (copy) => {
      const slot = copy.schedule.days[1].slots.find((candidate) => candidate.id === 'advanced-cross-day');
      expect(slot).toBeDefined();
      slot!.scheme = {
        kind: 'repeat',
        count: 2,
        reps: 5,
        load: { kind: 'pctOfSlot', day: 'thursday', slot: 'basic-table', idx: 2, pct: 0.8 },
      };
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('thursday')]),
    );
  });

  it('reports every problem, not only the first', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.progression[0].judgedSlots = ['mon-squats'];
      copy.progression[1].lift = 'clean';
    });
    const errors = validateProgramDefinition(definition);
    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining('mon-squats'), expect.stringContaining('clean')]),
    );
  });
});

describe('parseProgramDefinition', () => {
  it.each(FULLY_SUPPORTED_FIXTURES)('parses the %s fixture from JSON as ok', (_, definition) => {
    expect(parseProgramDefinition(asJson(definition))).toEqual({ kind: 'ok', definition });
  });

  it('parses an unknown load kind as unsupported instead of throwing', () => {
    const json = asJson(MADCOW_5X5) as ProgramDefinition;
    (madcowDay(json, 'mon').slots[0].scheme as { load: { kind: string } }).load = { kind: 'velocityLoad' };
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(parsed.kind === 'unsupported' && parsed.unknownKinds).toEqual(expect.arrayContaining(['velocityLoad']));
  });

  it('parses an unknown adjustment kind as unsupported', () => {
    const json = asJson(MADCOW_5X5) as ProgramDefinition;
    (json.progression[0].onMiss as { kind: string }[]) = [{ kind: 'autoDeload' }];
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(parsed.kind === 'unsupported' && parsed.unknownKinds).toEqual(expect.arrayContaining(['autoDeload']));
  });

  it('parses an unknown schedule kind as unsupported', () => {
    const json = asJson(MADCOW_5X5) as { schedule: { kind: string } };
    json.schedule.kind = 'block';
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(parsed.kind === 'unsupported' && parsed.unknownKinds).toEqual(expect.arrayContaining(['block']));
  });

  it('parses an unknown set scheme kind as unsupported', () => {
    const json = asJson(MADCOW_5X5) as ProgramDefinition;
    (madcowDay(json, 'mon').slots[0] as { scheme: { kind: string } }).scheme = { kind: 'cluster' };
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(parsed.kind === 'unsupported' && parsed.unknownKinds).toEqual(expect.arrayContaining(['cluster']));
  });

  it('parses a definition with a semantic error as invalid with readable errors', () => {
    const json = asJson(broken(MADCOW_5X5, (copy) => (copy.progression[0].judgedSlots = ['mon-squats'])));
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('invalid');
    expect(parsed.kind === 'invalid' && parsed.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('mon-squats')]),
    );
  });

  it.each([null, 42, 'madcow', [], {}])('parses %j as invalid without throwing', (json) => {
    expect(parseProgramDefinition(json).kind).toBe('invalid');
  });

  it('does not throw from validateProgramDefinition on a definition with an unknown kind', () => {
    const json = asJson(MADCOW_5X5) as ProgramDefinition;
    (madcowDay(json, 'mon').slots[0].scheme as { load: { kind: string } }).load = { kind: 'velocityLoad' };
    expect(() => validateProgramDefinition(json)).not.toThrow();
  });
});

describe('parseProgramDefinition marks 1b progression semantics as unsupported until implemented', () => {
  it.each(SLICE_1B_ADJUSTMENTS)('parses a rule using %s as unsupported and names it', (kind, adjustment) => {
    const json = asJson(
      broken(LINEAR_AFTER_SESSION, (copy) => {
        copy.progression[0].onMiss = [adjustment];
      }),
    );
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(namedUnsupportedKinds(parsed)).toContain(kind);
  });

  it('parses a rule with no trigger as invalid with an error naming the trigger, not as unsupported', () => {
    const json = asJson(LINEAR_AFTER_SESSION) as { progression: Record<string, unknown>[] };
    delete json.progression[0].trigger;
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('invalid');
    expect(parsed.kind === 'invalid' && parsed.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('trigger')]),
    );
  });

  it('parses a rule with a non-text trigger as invalid', () => {
    const json = asJson(LINEAR_AFTER_SESSION) as { progression: Record<string, unknown>[] };
    json.progression[0].trigger = 7;
    expect(parseProgramDefinition(json).kind).toBe('invalid');
  });

  it('parses a rule on the endOfWave trigger as unsupported and names it', () => {
    const json = asJson(
      broken(LINEAR_AFTER_SESSION, (copy) => {
        copy.progression[0].trigger = 'endOfWave';
      }),
    );
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(namedUnsupportedKinds(parsed)).toContain('endOfWave');
  });

  it('parses the GZCLP shape as unsupported, naming stageMachine and amrapThreshold', () => {
    const parsed = parseProgramDefinition(asJson(GZCLP));
    expect(parsed.kind).toBe('unsupported');
    expect(namedUnsupportedKinds(parsed)).toEqual(expect.arrayContaining(['stageMachine', 'amrapThreshold']));
  });

  it('parses the full primitive set as unsupported, naming every 1b adjustment and endOfWave', () => {
    const parsed = parseProgramDefinition(asJson(FULL_PRIMITIVES));
    expect(parsed.kind).toBe('unsupported');
    expect(namedUnsupportedKinds(parsed)).toEqual(
      expect.arrayContaining([
        'failureCounter',
        'stageMachine',
        'amrapThreshold',
        'amrapTable',
        'repsOverStandard',
        'e1rmFromSet',
        'customRule',
        'endOfWave',
      ]),
    );
  });
});

describe('resolving a primitive whose 1b semantics are not implemented', () => {
  const enrollment = fullPrimitivesEnrollment();
  const state = refsState({ squat: { tm: 100 }, bench: { top: 100, e1rm: 120, workingWeight: 80, fiveRm: 100 } });

  it('returns a typed unsupported result per slot instead of throwing', () => {
    const resolved = resolvePrescription(
      FULL_PRIMITIVES,
      enrollment,
      state,
      { cycle: 1, week: 1, day: 'advanced' },
      {},
    );
    expect(
      resolved.map((entry) => [entry.slotId, entry.kind, entry.kind === 'unsupported' ? entry.primitive : null]),
    ).toEqual(
      Object.entries(SLICE_1B_PRIMITIVES_BY_SLOT).map(([slotId, primitive]) => [slotId, 'unsupported', primitive]),
    );
  });

  it('names the lift of each unsupported slot', () => {
    const resolved = resolvePrescription(
      FULL_PRIMITIVES,
      enrollment,
      state,
      { cycle: 1, week: 1, day: 'advanced' },
      {},
    );
    expect(resolved.map((entry) => entry.lift)).toEqual(['bench', 'bench', 'squat', 'squat', 'bench']);
  });

  it('still resolves the 1a primitives of the same definition: week table, first-set repeat, pct, ramp, sameAs, lastLogged', () => {
    const resolved = resolvePrescription(
      FULL_PRIMITIVES,
      enrollment,
      state,
      { cycle: 1, week: 1, day: 'basic' },
      { curl: 15 },
    );
    expect(resolved.every((entry) => entry.kind === 'exercise')).toBe(true);
    expect(weightsOf(resolved, 'basic-table')).toEqual([65, 75, 85]);
    expect(weightsOf(resolved, 'basic-first-set-last')).toEqual([65, 65, 65]);
    expect(weightsOf(resolved, 'basic-pct')).toEqual([50, 30, 70]);
    expect(weightsOf(resolved, 'basic-ramp')).toEqual([50, 62.5, 75, 87.5, 100]);
    expect(weightsOf(resolved, 'basic-same-as')).toEqual([75]);
    expect(slotOf(resolved, 'basic-last-logged').sets.map((set) => set.weightKg)).toEqual([15, 15, 15]);
  });

  it('marks a single optional set and an AMRAP set in a set list', () => {
    const resolved = resolvePrescription(FULL_PRIMITIVES, enrollment, state, { cycle: 1, week: 1, day: 'basic' }, {});
    const sets = slotOf(resolved, 'basic-pct').sets;
    expect(sets.map((set) => set.optional)).toEqual([false, true, false]);
    expect(sets.map((set) => set.amrap)).toEqual([false, false, true]);
    expect(sets.map((set) => set.minReps)).toEqual([null, null, 5]);
  });

  it('drops a slot whose option condition is false (basic-pct needs tmPct 0.9)', () => {
    const resolved = resolvePrescription(
      FULL_PRIMITIVES,
      { ...enrollment, options: { ...enrollment.options, tmPct: 0.85 } },
      state,
      { cycle: 1, week: 1, day: 'basic' },
      {},
    );
    expect(resolved.map((entry) => entry.slotId)).not.toContain('basic-pct');
  });
});

describe('5/3/1 definition resolves without unsupported results', () => {
  it.each(['squat', 'bench', 'deadlift', 'press'])('%s day in every week', (day) => {
    for (const week of [1, 2, 3, 4]) {
      const resolved = resolvePrescription(
        FIVE_THREE_ONE,
        fiveThreeOneEnrollment(),
        refsState({ [day]: { tm: 100 } }),
        { cycle: 1, week, day },
        {},
      );
      expect(resolved.every((entry) => entry.kind === 'exercise')).toBe(true);
    }
  });
});
