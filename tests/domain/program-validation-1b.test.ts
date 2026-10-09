import { describe, expect, it } from 'vitest';
import {
  type Adjustment,
  type ChoiceOptionDecl,
  type Load,
  type ProgramDefinition,
  type SlotDecl,
  validateProgramDefinition,
} from '@domain/index.ts';
import { FULL_PRIMITIVES } from './program-fixtures/full_primitives.ts';
import { GZCLP } from './program-fixtures/gzclp.ts';
import { JUGGERNAUT_2 } from './program-fixtures/juggernaut_2.ts';
import { LINEAR_AFTER_SESSION } from './program-fixtures/linear_after_session.ts';
import { MADCOW_5X5 } from './program-fixtures/madcow_5x5.ts';
import { NSUNS_5DAY } from './program-fixtures/nsuns_5day.ts';
import { broken } from './program-fixtures/prescription-helpers.ts';
import { RPE_TOP_SET } from './program-fixtures/rpe_top_set.ts';
import { TEXAS_METHOD } from './program-fixtures/texas_method.ts';

function slotIn(definition: ProgramDefinition, slotId: string): SlotDecl {
  const slot = definition.schedule.days.flatMap((day) => day.slots).find((candidate) => candidate.id === slotId);
  if (!slot) throw new Error(`no slot ${slotId}`);
  return slot;
}

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

describe('validateProgramDefinition rejects judgedSets that judge nothing', () => {
  it('judgedSets 4 on the 4-set Wednesday deadlift', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      const rule = copy.progression.find((candidate) => candidate.lift === 'deadlift');
      if (rule) rule.judgedSets = [4];
    });
    errorsMention(definition, 'judgedSets', '4', 'wed-deadlift', '4 sets');
  });

  it('an empty judgedSets list', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.progression[0].judgedSets = [];
    });
    errorsMention(definition, 'judgedSets', 'no set');
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
