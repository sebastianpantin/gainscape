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
import { broken, refsState, slotOf, weightsOf } from './program-fixtures/prescription-helpers.ts';

const FIXTURES: [string, ProgramDefinition][] = [
  ['five_three_one', FIVE_THREE_ONE],
  ['madcow_5x5', MADCOW_5X5],
  ['gzclp', GZCLP],
  ['synthetic after-session linear', LINEAR_AFTER_SESSION],
  ['synthetic full primitive set', FULL_PRIMITIVES],
];

const FULLY_SUPPORTED_FIXTURES: [string, ProgramDefinition][] = [
  ['five_three_one', FIVE_THREE_ONE],
  ['madcow_5x5', MADCOW_5X5],
  ['gzclp', GZCLP],
  ['synthetic after-session linear', LINEAR_AFTER_SESSION],
];

const SLICE_1B_ADJUSTMENTS: [string, Adjustment][] = [
  ['failureCounter', { kind: 'failureCounter', threshold: 3, deloadPct: 0.1 }],
  ['stageMachine', { kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85, from: 'fiveRm' } }],
  ['amrapThreshold', { kind: 'amrapThreshold', setIndex: 2, reps: 25 }],
  ['amrapTable', { kind: 'amrapTable', setIndex: 2, bands: [[2, { kg: 2.5, lb: 5 }]] }],
  [
    'repsOverStandard',
    { kind: 'repsOverStandard', setIndex: 2, standardByWave: [10], perRep: { kg: 2.5, lb: 5 }, cap: 10 },
  ],
  ['e1rmFromSet', { kind: 'e1rmFromSet', setIndex: 2 }],
];

function namedUnsupportedKinds(parsed: ReturnType<typeof parseProgramDefinition>): string[] {
  const lists = parsed as { unknownKinds?: string[]; unsupportedKinds?: string[] };
  return [...(lists.unknownKinds ?? []), ...(lists.unsupportedKinds ?? [])];
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

  it('parses a definition with no source as ok, since only the catalog loader asks for sources', () => {
    const definition = { ...structuredClone(MADCOW_5X5), source: [] };
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

describe('parseProgramDefinition supports the 1b progression semantics', () => {
  it.each(SLICE_1B_ADJUSTMENTS)('does not name %s as unsupported', (kind, adjustment) => {
    const json = asJson(
      broken(LINEAR_AFTER_SESSION, (copy) => {
        copy.progression[0].onMiss = [adjustment];
      }),
    );
    expect(namedUnsupportedKinds(parseProgramDefinition(json))).not.toContain(kind);
  });

  it('parses a rule using customRule as unsupported and names it, since a custom rule has no semantics', () => {
    const json = asJson(
      broken(LINEAR_AFTER_SESSION, (copy) => {
        copy.progression[0].onMiss = [{ kind: 'customRule', name: 'synthetic' }];
      }),
    );
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(namedUnsupportedKinds(parsed)).toContain('customRule');
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

  it('does not name the endOfWave trigger as unsupported', () => {
    const json = asJson(
      broken(LINEAR_AFTER_SESSION, (copy) => {
        copy.progression[0].trigger = 'endOfWave';
      }),
    );
    expect(namedUnsupportedKinds(parseProgramDefinition(json))).not.toContain('endOfWave');
  });

  it('still parses a truly unknown trigger (endOfBlock) as unsupported and names it', () => {
    const json = asJson(LINEAR_AFTER_SESSION) as { progression: Record<string, unknown>[] };
    json.progression[0].trigger = 'endOfBlock';
    const parsed = parseProgramDefinition(json);
    expect(parsed.kind).toBe('unsupported');
    expect(namedUnsupportedKinds(parsed)).toContain('endOfBlock');
  });

  it('parses the full GZCLP program as ok', () => {
    expect(parseProgramDefinition(asJson(GZCLP))).toEqual({ kind: 'ok', definition: GZCLP });
  });

  it('parses the full primitive set as unsupported naming only customRule', () => {
    const parsed = parseProgramDefinition(asJson(FULL_PRIMITIVES));
    expect(parsed.kind).toBe('unsupported');
    expect(namedUnsupportedKinds(parsed)).toEqual(['customRule']);
  });
});

describe('resolving the 1b primitives of the synthetic definition', () => {
  const enrollment = fullPrimitivesEnrollment();
  const state = refsState({ squat: { tm: 100 }, bench: { top: 100, e1rm: 120, workingWeight: 80, fiveRm: 100 } });
  const advanced = () =>
    resolvePrescription(FULL_PRIMITIVES, enrollment, state, { cycle: 1, week: 1, day: 'advanced' }, {});

  it.each(Object.entries(SLICE_1B_PRIMITIVES_BY_SLOT))('resolves %s (%s) as an exercise', (slotId) => {
    expect(advanced().find((entry) => entry.slotId === slotId)?.kind).toBe('exercise');
  });

  it('keeps the lift of each slot', () => {
    expect(advanced().map((entry) => entry.lift)).toEqual(['bench', 'bench', 'squat', 'squat', 'bench']);
  });

  it('rpeLoad: 3 @ RPE 8 of e1RM 120 is 120 × 0.863 = 103.56 → 102.5', () => {
    expect(weightsOf(advanced(), 'advanced-rpe-top')).toEqual([102.5]);
  });

  it('pctOfSet: five optional back-offs at 95% of the rounded 102.5 = 97.375 → 97.5', () => {
    const sets = slotOf(advanced(), 'advanced-backoff').sets;
    expect(sets.map((set) => [set.weight, set.optional])).toEqual(Array.from({ length: 5 }, () => [97.5, true]));
  });

  it("pctOfSlot: 80% of the basic day's week 1 set 3 (85% × 100 = 85) is 68 → 67.5", () => {
    expect(weightsOf(advanced(), 'advanced-cross-day')).toEqual([67.5, 67.5]);
  });

  it('cumulativeAddOn: week 1 adds nothing, 70% × 100 = 70', () => {
    expect(weightsOf(advanced(), 'advanced-add-on')).toEqual([70, 70, 70, 70, 70, 70]);
  });

  it('cumulativeAddOn: week 2 adds 5, 70 + 5 = 75', () => {
    const resolved = resolvePrescription(
      FULL_PRIMITIVES,
      enrollment,
      state,
      { cycle: 1, week: 2, day: 'advanced' },
      {},
    );
    expect(weightsOf(resolved, 'advanced-add-on')[0]).toBe(75);
  });

  it('stages: with no stage recorded the first stage applies, 5×3+ @ the working weight 80', () => {
    const sets = slotOf(advanced(), 'advanced-stages').sets;
    expect(sets.map((set) => [set.weight, set.reps])).toEqual(Array.from({ length: 5 }, () => [80, 3]));
    expect(sets[4].amrap).toBe(true);
  });

  it('stages: stage 2 recorded for bench gives 6×2+', () => {
    const resolved = resolvePrescription(
      FULL_PRIMITIVES,
      enrollment,
      { ...state, stages: { bench: 1 } },
      { cycle: 1, week: 1, day: 'advanced' },
      {},
    );
    expect(slotOf(resolved, 'advanced-stages').sets.map((set) => set.reps)).toEqual([2, 2, 2, 2, 2, 2]);
  });
});

describe('resolving the 1a primitives of the synthetic definition', () => {
  const enrollment = fullPrimitivesEnrollment();
  const state = refsState({ squat: { tm: 100 }, bench: { top: 100, e1rm: 120, workingWeight: 80, fiveRm: 100 } });

  it('resolves week table, first-set repeat, pct, ramp, sameAs and lastLogged', () => {
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
