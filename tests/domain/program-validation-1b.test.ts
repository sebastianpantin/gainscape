import { describe, expect, it } from 'vitest';
import { type ProgramDefinition, validateProgramDefinition } from '@domain/index.ts';
import {
  type Adjustment,
  type ChoiceOptionDecl,
  type Load,
  type SetSpec,
  type StageDecl,
} from '@domain/program-types.ts';
import { FULL_PRIMITIVES } from './program-fixtures/full_primitives.ts';
import { GZCLP } from './program-fixtures/gzclp.ts';
import { JUGGERNAUT_2 } from './program-fixtures/juggernaut_2.ts';
import { LINEAR_AFTER_SESSION } from './program-fixtures/linear_after_session.ts';
import { MADCOW_5X5 } from './program-fixtures/madcow_5x5.ts';
import { NSUNS_5DAY } from './program-fixtures/nsuns_5day.ts';
import { broken, slotIn } from './program-fixtures/prescription-helpers.ts';
import { STAGED_WEEKLY, UNSUPPORTED_JUDGED_SCHEMES } from './program-fixtures/review-fixtures.ts';
import { RPE_TOP_SET } from './program-fixtures/rpe_top_set.ts';
import { SMOLOV_JR } from './program-fixtures/smolov_jr.ts';
import { TEXAS_METHOD } from './program-fixtures/texas_method.ts';

function setLoad(definition: ProgramDefinition, slotId: string, load: Load) {
  const scheme = slotIn(definition, slotId).scheme;
  if (scheme.kind === 'sets') scheme.sets[0] = { ...scheme.sets[0], load };
  else if (scheme.kind === 'repeat' || scheme.kind === 'stages') scheme.load = load;
  else throw new Error(`slot ${slotId} has no declared load`);
}

function errorsMention(definition: ProgramDefinition, ...tokens: string[]) {
  expect(validateProgramDefinition(definition)).toEqual(
    expect.arrayContaining([expect.stringMatching(new RegExp(tokens.map(escaped).join('.*')))]),
  );
}

function escaped(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function onlyAdjustment(definition: ProgramDefinition, ruleIndex: number, adjustment: Adjustment) {
  definition.progression[ruleIndex].onMet = [];
  definition.progression[ruleIndex].onMiss = [];
  definition.progression[ruleIndex].always = [adjustment];
}

describe('validateProgramDefinition rejects stage machines without stages', () => {
  it('a stageMachine on a rule that judges no stages slot', () => {
    const definition = broken(LINEAR_AFTER_SESSION, (copy) => {
      copy.referenceVars = ['tm', 'fiveRm'];
      copy.progression[0].onMiss = [
        { kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85, from: 'fiveRm' } },
      ];
    });
    errorsMention(definition, 'stageMachine');
  });

  it('accepts a stageMachine on GZCLP, whose rules judge stages slots', () => {
    expect(validateProgramDefinition(GZCLP)).toEqual([]);
  });

  it('a retest that reads an undeclared reference var (top in GZCLP)', () => {
    const definition = broken(GZCLP, (copy) => {
      copy.progression[0].onMiss = [{ kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85, from: 'top' } }];
    });
    errorsMention(definition, 'top');
  });
});

describe('validateProgramDefinition rejects waves that do not fit', () => {
  it('an endOfWave rule on a cycle with no waveWeeks', () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      if (copy.schedule.kind === 'cycle') delete copy.schedule.waveWeeks;
    });
    errorsMention(definition, 'waveWeeks');
  });

  it('an endOfWave rule on a weekly schedule', () => {
    const definition = broken(LINEAR_AFTER_SESSION, (copy) => {
      copy.progression[0].trigger = 'endOfWave';
    });
    errorsMention(definition, 'endOfWave');
  });

  it('a repsOverStandard on another trigger with no waveWeeks', () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      if (copy.schedule.kind === 'cycle') delete copy.schedule.waveWeeks;
      for (const rule of copy.progression) rule.trigger = 'endOfCycle';
    });
    errorsMention(definition, 'repsOverStandard', 'waveWeeks');
  });

  it('waveWeeks 5 that does not divide 16 weeks per cycle', () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      if (copy.schedule.kind === 'cycle') copy.schedule.waveWeeks = 5;
    });
    errorsMention(definition, 'waveWeeks', '5');
  });

  it('standardByWave with 3 standards for 4 waves (a wave would have no standard)', () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      const adjustment = copy.progression[0].always?.[0];
      if (adjustment?.kind === 'repsOverStandard') adjustment.standardByWave = [10, 8, 5];
    });
    errorsMention(definition, 'standardByWave');
  });

  it('standardByWave with 5 standards for 4 waves', () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      const adjustment = copy.progression[0].always?.[0];
      if (adjustment?.kind === 'repsOverStandard') adjustment.standardByWave = [10, 8, 5, 3, 1];
    });
    errorsMention(definition, 'standardByWave');
  });
});

describe('validateProgramDefinition rejects AMRAP bands out of order', () => {
  it.each([
    ['descending', [0, 4, 2]],
    ['a repeated minReps', [0, 2, 2]],
  ])('bands with %s (%j)', (_, minReps) => {
    const definition = broken(NSUNS_5DAY, (copy) => {
      const adjustment = copy.progression[0].always?.[0];
      if (adjustment?.kind === 'amrapTable') {
        adjustment.bands = minReps.map((reps) => [reps, { kg: reps, lb: reps * 2 }]);
      }
    });
    errorsMention(definition, 'bands');
  });
});

describe('validateProgramDefinition rejects a setIndex outside the judged slot', () => {
  it('amrapTable setIndex 9 on the 9-set Friday bench', () => {
    const definition = broken(NSUNS_5DAY, (copy) => {
      const adjustment = copy.progression[0].always?.[0];
      if (adjustment?.kind === 'amrapTable') adjustment.setIndex = 9;
    });
    errorsMention(definition, 'setIndex', '9');
  });

  it('amrapThreshold setIndex 3 on the 3-set T3 pulldown', () => {
    const definition = broken(GZCLP, (copy) => {
      const rule = copy.progression.find((candidate) => candidate.lift === 'pulldown-t3');
      if (rule) rule.onMet = [{ kind: 'amrapThreshold', setIndex: 3, reps: 25 }];
    });
    errorsMention(definition, 'setIndex', '3');
  });

  it('repsOverStandard setIndex 1 on the Juggernaut table, whose realization week has 1 set', () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      const adjustment = copy.progression[0].always?.[0];
      if (adjustment?.kind === 'repsOverStandard') adjustment.setIndex = 1;
    });
    errorsMention(definition, 'setIndex', '1');
  });

  it('e1rmFromSet setIndex 1 on the 1-set RPE top', () => {
    const definition = broken(RPE_TOP_SET, (copy) => onlyAdjustment(copy, 0, { kind: 'e1rmFromSet', setIndex: 1 }));
    errorsMention(definition, 'setIndex', '1');
  });
});

describe('validateProgramDefinition rejects judgedSetIndexes that judge nothing', () => {
  it('judgedSetIndexes 4 on the 4-set Wednesday deadlift', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      const rule = copy.progression.find((candidate) => candidate.lift === 'deadlift');
      if (rule) rule.judgedSetIndexes = [4];
    });
    errorsMention(definition, 'judgedSetIndexes', '4', 'wed-deadlift', '4 sets');
  });

  it('an empty judgedSetIndexes list', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.progression[0].judgedSetIndexes = [];
    });
    errorsMention(definition, 'judgedSetIndexes', 'no set');
  });
});

describe('validateProgramDefinition rejects a broken onlyForUnit', () => {
  it('a key that is not one of the option values (extra)', () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      (copy.options[0] as ChoiceOptionDecl).onlyForUnit = { fine: 'lb', extra: 'lb' };
    });
    errorsMention(definition, 'extra');
  });

  it("a unit that is not 'kg' or 'lb' (stone)", () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      (copy.options[0] as unknown as { onlyForUnit: Record<string, string> }).onlyForUnit = { fine: 'stone' };
    });
    errorsMention(definition, 'stone');
  });
});

describe('validateProgramDefinition rejects references that cannot resolve', () => {
  it('a pctOfSlot on a rotation schedule, which has no current week', () => {
    const definition = broken(GZCLP, (copy) => {
      setLoad(copy, 'a1-bench-t2', { kind: 'pctOfSlot', day: 'a1', slot: 'a1-squat-t1', idx: 0, pct: 0.8 });
    });
    errorsMention(definition, 'pctOfSlot', 'rotation');
  });

  it('a pctOfSet that references its own set (squat-fatigue:0)', () => {
    const definition = broken(RPE_TOP_SET, (copy) => {
      setLoad(copy, 'squat-fatigue', { kind: 'pctOfSet', ref: 'squat-fatigue:0', pct: 0.95 });
    });
    errorsMention(definition, 'squat-fatigue:0');
  });

  it('a sameAs that references its own set (basic-same-as:0)', () => {
    const definition = broken(FULL_PRIMITIVES, (copy) => {
      setLoad(copy, 'basic-same-as', { kind: 'sameAs', ref: 'basic-same-as:0' });
    });
    errorsMention(definition, 'basic-same-as:0');
  });

  it('a reference cycle A → B → A (squat-top reads squat-fatigue, which reads squat-top)', () => {
    const definition = broken(RPE_TOP_SET, (copy) => {
      setLoad(copy, 'squat-top', { kind: 'pctOfSet', ref: 'squat-fatigue:0', pct: 1.05 });
    });
    errorsMention(definition, 'squat-top');
  });

  it('a pctOfSlot cycle on Texas (Monday reads Wednesday, which reads Monday)', () => {
    const definition = broken(TEXAS_METHOD, (copy) => {
      setLoad(copy, 'mon-squat', { kind: 'pctOfSlot', day: 'wed', slot: 'wed-squat', idx: 0, pct: 1.25 });
    });
    errorsMention(definition, 'mon-squat');
  });

  it('does not throw on a reference cycle', () => {
    const definition = broken(RPE_TOP_SET, (copy) => {
      setLoad(copy, 'squat-top', { kind: 'pctOfSet', ref: 'squat-fatigue:0', pct: 1.05 });
    });
    expect(() => validateProgramDefinition(definition)).not.toThrow();
  });
});

describe('validateProgramDefinition pins for 1b loads', () => {
  it('a pct load reading an undeclared lift (squat-variant)', () => {
    const definition = broken(NSUNS_5DAY, (copy) => {
      setLoad(copy, 'thu-front-squat', { kind: 'pct', pct: 0.35, of: 'tm', lift: 'squat-variant' });
    });
    errorsMention(definition, 'squat-variant');
  });

  it('a pct add keyed by an unknown option (weeklyStep)', () => {
    const definition = broken(TEXAS_METHOD, (copy) => {
      setLoad(copy, 'fri-squat', {
        kind: 'pct',
        pct: 1,
        of: 'fiveRm',
        add: { option: 'weeklyStep', cases: { small: { kg: 2.5, lb: 5 } } },
      });
    });
    errorsMention(definition, 'weeklyStep');
  });

  it.each([
    [7, 8],
    [3, 6.5],
    [3, 10.5],
  ])('an rpeLoad off the chart: %d reps @ RPE %d', (reps, rpe) => {
    const definition = broken(RPE_TOP_SET, (copy) => {
      setLoad(copy, 'squat-top', { kind: 'rpeLoad', reps, rpe, of: 'e1rm' });
    });
    errorsMention(definition, 'off the RPE chart');
  });
});

describe('validateProgramDefinition bounds set indexes by the fewest sets a day can prescribe', () => {
  const optionCounted = (count: number[]) =>
    broken(LINEAR_AFTER_SESSION, (copy) => {
      copy.options = [{ key: 'sets', kind: 'choice', values: count, default: count[0], source: ['synthetic'] }];
      for (const day of copy.schedule.days) {
        day.slots[0].scheme = {
          kind: 'repeat',
          count: { option: 'sets' },
          reps: 5,
          load: { kind: 'pct', pct: 1, of: 'tm' },
        };
      }
    });

  it('judgedSetIndexes 5 on stages 5×3, 6×2, 10×1: the 5×3 day never prescribes it', () => {
    const definition = broken(STAGED_WEEKLY, (copy) => {
      copy.progression[0].judgedSetIndexes = [5];
    });
    errorsMention(definition, 'judgedSetIndexes', '5', 'a-bench', '5 sets');
  });

  it('accepts judgedSetIndexes 4 on the same stages, which every stage prescribes', () => {
    const definition = broken(STAGED_WEEKLY, (copy) => {
      copy.progression[0].judgedSetIndexes = [4];
    });
    expect(validateProgramDefinition(definition)).toEqual([]);
  });

  it('amrapThreshold setIndex 5 on the GZCLP T1 stages, whose first stage has 5 sets', () => {
    const definition = broken(GZCLP, (copy) => {
      copy.progression[0].onMet = [{ kind: 'amrapThreshold', setIndex: 5, reps: 10 }];
    });
    errorsMention(definition, 'setIndex', '5', '5 sets');
  });

  it('judgedSetIndexes 3 on a repeat counted by an option that can be 3', () => {
    const definition = broken(optionCounted([5, 3]), (copy) => {
      copy.progression[0].judgedSetIndexes = [3];
    });
    errorsMention(definition, 'judgedSetIndexes', '3', 'a-squat', '3 sets');
  });

  it('accepts judgedSetIndexes 2 on that repeat', () => {
    const definition = broken(optionCounted([5, 3]), (copy) => {
      copy.progression[0].judgedSetIndexes = [2];
    });
    expect(validateProgramDefinition(definition)).toEqual([]);
  });

  it('a sameAs ref to set 5 of stages whose first stage has 5 sets', () => {
    const definition = broken(STAGED_WEEKLY, (copy) => {
      copy.schedule.days[0].slots.push({
        id: 'a-backoff',
        lift: 'bench',
        role: 'supplemental',
        scheme: { kind: 'sets', sets: [{ reps: 5, load: { kind: 'sameAs', ref: 'a-bench:5' } }] },
      });
    });
    errorsMention(definition, 'a-bench:5', '5 sets');
  });
});

describe('validateProgramDefinition checks the set an e1rmFromSet reads', () => {
  const topSet = (set: Partial<SetSpec>) =>
    broken(RPE_TOP_SET, (copy) => {
      const scheme = slotIn(copy, 'squat-top').scheme;
      if (scheme.kind === 'sets') scheme.sets[0] = { ...scheme.sets[0], ...set };
    });

  it('accepts 3 fixed reps', () => {
    expect(validateProgramDefinition(RPE_TOP_SET)).toEqual([]);
  });

  it.each([
    ['8 reps, which the chart does not reach', { reps: 8, load: { kind: 'pct', pct: 0.8, of: 'e1rm' } }],
    ['open reps', { reps: null }],
    ['an AMRAP set', { amrap: true }],
    ['a rep range', { maxReps: 5 }],
  ] as [string, Partial<SetSpec>][])('rejects %s', (_name, set) => {
    errorsMention(topSet(set), 'squat', 'setIndex 0 of e1rmFromSet', 'squat-top', 'RPE chart');
  });

  it('rejects stages where one stage has reps off the chart', () => {
    const definition = broken(STAGED_WEEKLY, (copy) => {
      const scheme = slotIn(copy, 'b-bench').scheme;
      if (scheme.kind === 'stages') scheme.stages[2] = { sets: 5, reps: 8, amrapLast: false };
      copy.progression[1].always = [{ kind: 'e1rmFromSet', setIndex: 0 }];
    });
    errorsMention(definition, 'e1rmFromSet', 'b-bench', 'RPE chart');
  });

  it('names the setIndex alone when the slot never prescribes that set', () => {
    const definition = broken(RPE_TOP_SET, (copy) => onlyAdjustment(copy, 0, { kind: 'e1rmFromSet', setIndex: 1 }));
    expect(validateProgramDefinition(definition).filter((error) => error.includes('RPE chart'))).toEqual([]);
  });
});

describe('validateProgramDefinition rejects stages a logged day cannot tell apart', () => {
  const withStages = (stages: StageDecl[]) =>
    broken(STAGED_WEEKLY, (copy) => {
      const scheme = slotIn(copy, 'b-bench').scheme;
      if (scheme.kind === 'stages') scheme.stages = stages;
    });

  it('3×5 then 5×5: a 3×5 day logged in full is also the start of a 5×5 day', () => {
    const definition = withStages([
      { sets: 3, reps: 5, amrapLast: false },
      { sets: 5, reps: 5, amrapLast: false },
    ]);
    errorsMention(definition, 'b-bench', 'stages 1 and 2', 'tell apart');
  });

  it('the same stage twice', () => {
    const definition = withStages([
      { sets: 5, reps: 3, amrapLast: true },
      { sets: 6, reps: 2, amrapLast: true },
      { sets: 5, reps: 3, amrapLast: true },
    ]);
    errorsMention(definition, 'b-bench', 'stages 1 and 3', 'tell apart');
  });

  it('accepts 3×5+ then 5×5+, whose AMRAP set sits at a different index', () => {
    const definition = withStages([
      { sets: 3, reps: 5, amrapLast: true },
      { sets: 5, reps: 5, amrapLast: true },
    ]);
    expect(validateProgramDefinition(definition)).toEqual([]);
  });
});

describe('validateProgramDefinition rejects empty and short lists the engine would read past', () => {
  it('an amrapTable with no bands', () => {
    const definition = broken(NSUNS_5DAY, (copy) => {
      const adjustment = copy.progression[0].always?.[0];
      if (adjustment?.kind === 'amrapTable') adjustment.bands = [];
    });
    errorsMention(definition, 'amrapTable', 'no bands');
  });

  it('a stages scheme with no stages', () => {
    const definition = broken(STAGED_WEEKLY, (copy) => {
      const scheme = slotIn(copy, 'a-bench').scheme;
      if (scheme.kind === 'stages') scheme.stages = [];
    });
    errorsMention(definition, 'a-bench', 'no stages');
  });

  it('a cumulativeAddOn with 2 byWeek entries on the 3-week Smolov Jr cycle', () => {
    const definition = broken(SMOLOV_JR, (copy) => {
      for (const day of copy.schedule.days) {
        const scheme = day.slots[0].scheme;
        if (scheme.kind === 'repeat' && scheme.load.kind === 'cumulativeAddOn') {
          scheme.load.byWeek = scheme.load.byWeek.slice(0, 2);
        }
      }
    });
    errorsMention(definition, 'cumulativeAddOn', '2 byWeek entries', 'week 3');
  });

  it('a cumulativeAddOn with no byWeek entries on a weekly schedule', () => {
    const definition = broken(LINEAR_AFTER_SESSION, (copy) => {
      setLoad(copy, 'a-squat', { kind: 'cumulativeAddOn', pct: 0.7, of: 'tm', byWeek: [] });
    });
    errorsMention(definition, 'cumulativeAddOn', '0 byWeek entries', 'week 1');
  });

  it('accepts a cumulativeAddOn with more byWeek entries than the cycle has weeks', () => {
    const definition = broken(SMOLOV_JR, (copy) => {
      for (const day of copy.schedule.days) {
        const scheme = day.slots[0].scheme;
        if (scheme.kind === 'repeat' && scheme.load.kind === 'cumulativeAddOn') {
          scheme.load.byWeek = [...scheme.load.byWeek, { kg: 10, lb: 25 }];
        }
      }
    });
    expect(validateProgramDefinition(definition)).toEqual([]);
  });
});

describe('validateProgramDefinition rejects what the agreement property found the engine cannot prescribe', () => {
  it('a week table on a weekly schedule, which has no row once the weeks pass its last one', () => {
    errorsMention(UNSUPPORTED_JUDGED_SCHEMES, 'a-bench', "week table 'main'", 'weekly schedule');
  });

  it('a weekTablePct load on a weekly schedule', () => {
    const definition = broken(UNSUPPORTED_JUDGED_SCHEMES, (copy) => {
      for (const slot of copy.schedule.days[0].slots) {
        slot.scheme = {
          kind: 'repeat',
          count: 3,
          reps: 5,
          load: { kind: 'weekTablePct', table: 'main', set: 0, of: 'tm' },
        };
      }
    });
    errorsMention(definition, 'a-squat', "week table 'main'", 'weekly schedule');
  });

  it('a week table with no rows on a rotation, which reads its first row every day', () => {
    const definition = broken(GZCLP, (copy) => {
      copy.weekTables = { main: [] };
      slotIn(copy, 'a1-squat-t1').scheme = { kind: 'weekTable', table: 'main', of: 'workingWeight' };
    });
    errorsMention(definition, 'a1-squat-t1', "week table 'main'", 'no rows');
  });

  it('a set that reads an earlier set of its own slot, which the resolver cannot reach (basic-pct:0)', () => {
    const definition = broken(FULL_PRIMITIVES, (copy) => {
      const scheme = slotIn(copy, 'basic-pct').scheme;
      if (scheme.kind === 'sets') scheme.sets[2].load = { kind: 'pctOfSet', ref: 'basic-pct:0', pct: 0.9 };
    });
    errorsMention(definition, 'basic-pct', "its own set 'basic-pct:0'");
  });

  it('a pctOfSlot that reads its own slot (wed-squat:0)', () => {
    const definition = broken(TEXAS_METHOD, (copy) => {
      setLoad(copy, 'wed-squat', { kind: 'pctOfSlot', day: 'wed', slot: 'wed-squat', idx: 0, pct: 0.8 });
    });
    errorsMention(definition, 'wed-squat', "its own set 'wed-squat:0'");
  });

  it("an opening increment keyed by an option whose cases lack one of the option's values (fine)", () => {
    const definition = broken(JUGGERNAUT_2, (copy) => {
      copy.progression[0].onMet = [
        {
          kind: 'increment',
          by: { kg: 2.5, lb: 5 },
          opening: { times: 2, by: { option: 'perRep', cases: { standard: { kg: 5, lb: 10 } } } },
        },
      ];
    });
    errorsMention(definition, 'perRep', 'fine');
  });

  it('a weekTablePct that reads set 3 of a table whose rows have 3 sets', () => {
    const definition = broken(FULL_PRIMITIVES, (copy) => {
      setLoad(copy, 'basic-first-set-last', { kind: 'weekTablePct', table: 'main', set: 3, of: 'tm' });
    });
    errorsMention(definition, 'basic-first-set-last', 'set 3', "week table 'main'", '3 sets');
  });
});
