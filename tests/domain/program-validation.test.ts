import { describe, expect, it } from 'vitest';
import {
  type ProgramDefinition,
  type RepeatScheme,
  validateEnrollment,
  validateProgramDefinition,
} from '@domain/index.ts';
import { FIVE_THREE_ONE, fiveThreeOneEnrollment } from './program-fixtures/five_three_one.ts';
import { LINEAR_AFTER_SESSION } from './program-fixtures/linear_after_session.ts';
import { MADCOW_5X5, madcowEnrollment } from './program-fixtures/madcow_5x5.ts';

function broken(definition: ProgramDefinition, mutate: (copy: ProgramDefinition) => void): ProgramDefinition {
  const copy = structuredClone(definition);
  mutate(copy);
  return copy;
}

function beginnerBbbScheme(copy: ProgramDefinition): RepeatScheme {
  const slot = copy.schedule.days[0].slots.find((candidate) => candidate.id === 'squat-bbb-beginner');
  expect(slot).toBeDefined();
  return slot!.scheme as RepeatScheme;
}

describe('validateProgramDefinition rejects expressions that cannot be evaluated', () => {
  it('an empty byCycle table', () => {
    const definition = broken(FIVE_THREE_ONE, (copy) => {
      beginnerBbbScheme(copy).load = { kind: 'pct', pct: { byCycle: [] }, of: 'tm' };
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('byCycle')]));
  });

  it("an option-keyed amount whose cases lack one of the option's values (fine)", () => {
    const definition = broken(LINEAR_AFTER_SESSION, (copy) => {
      copy.options = [
        { key: 'perRep', kind: 'choice', values: ['standard', 'fine'], default: 'standard', source: ['synthetic'] },
      ];
      copy.progression[0].onMet = [
        { kind: 'increment', by: { option: 'perRep', cases: { standard: { kg: 2.5, lb: 5 } } } },
      ];
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('fine')]));
  });

  it('a numeric expression that reads an option with text values (supplemental)', () => {
    const definition = broken(FIVE_THREE_ONE, (copy) => {
      beginnerBbbScheme(copy).load = { kind: 'pct', pct: { option: 'supplemental' }, of: 'tm' };
    });
    expect(validateProgramDefinition(definition)).toEqual(
      expect.arrayContaining([expect.stringContaining('supplemental')]),
    );
  });

  it('an empty schedule', () => {
    const definition = broken(MADCOW_5X5, (copy) => {
      copy.schedule.days = [];
      copy.progression = [];
    });
    expect(validateProgramDefinition(definition)).toEqual(expect.arrayContaining([expect.stringContaining('days')]));
  });
});

describe('validateEnrollment accepts', () => {
  it('the default 5/3/1 enrollment', () => {
    expect(validateEnrollment(FIVE_THREE_ONE, fiveThreeOneEnrollment())).toEqual([]);
  });

  it('a 5/3/1 enrollment entered as 1RMs in lb', () => {
    expect(validateEnrollment(FIVE_THREE_ONE, fiveThreeOneEnrollment({ unit: 'lb', oneRms: { squat: 315 } }))).toEqual(
      [],
    );
  });

  it('the default Madcow enrollment', () => {
    expect(validateEnrollment(MADCOW_5X5, madcowEnrollment())).toEqual([]);
  });
});

describe('validateEnrollment rejects with a readable error', () => {
  it('a binding for a lift the template does not declare (clean)', () => {
    const enrollment = madcowEnrollment({ bindings: { clean: 'power-clean' } });
    expect(validateEnrollment(MADCOW_5X5, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('clean')]),
    );
  });

  it.each([0, -2.5, Number.NaN])('a rounding increment of %s', (increment) => {
    const enrollment = {
      ...fiveThreeOneEnrollment(),
      rounding: { increment, mode: 'nearest' as const, barWeight: 20 },
    };
    expect(validateEnrollment(FIVE_THREE_ONE, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('increment')]),
    );
  });

  it('an option the template does not declare (jokers)', () => {
    const enrollment = fiveThreeOneEnrollment({ options: { jokers: 'on' } });
    expect(validateEnrollment(FIVE_THREE_ONE, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('jokers')]),
    );
  });

  it('a choice option value outside its values (bbbPct 0.65)', () => {
    const enrollment = fiveThreeOneEnrollment({ options: { bbbPct: 0.65 } });
    expect(validateEnrollment(FIVE_THREE_ONE, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('bbbPct')]),
    );
  });

  it('a number option outside its range (tmReset 0.2, range 0.1–0.15)', () => {
    const enrollment = fiveThreeOneEnrollment({ options: { tmReset: 0.2 } });
    expect(validateEnrollment(FIVE_THREE_ONE, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('tmReset')]),
    );
  });

  it('a text value for an option read by a numeric expression (bbbPct heavy)', () => {
    const enrollment = fiveThreeOneEnrollment({ options: { bbbPct: 'heavy' } });
    expect(validateEnrollment(FIVE_THREE_ONE, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('bbbPct')]),
    );
  });

  it('a declared lift with none of its input kinds (squat)', () => {
    const enrollment = { ...fiveThreeOneEnrollment(), inputs: { ...fiveThreeOneEnrollment().inputs, squat: {} } };
    expect(validateEnrollment(FIVE_THREE_ONE, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('squat')]),
    );
  });

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])('a squat input of %s', (value) => {
    const enrollment = fiveThreeOneEnrollment({ tms: { squat: value } });
    expect(validateEnrollment(FIVE_THREE_ONE, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('squat')]),
    );
  });

  it('an input kind the template does not declare for that lift (Madcow squat tm instead of fiveRm)', () => {
    const enrollment = { ...madcowEnrollment(), inputs: { ...madcowEnrollment().inputs, squat: { tm: 100 } } };
    expect(validateEnrollment(MADCOW_5X5, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('squat')]),
    );
  });
});

describe('validateEnrollment bounds inputs to the lifts and values the template takes', () => {
  it('rejects an input for a declared lift that takes no input (Madcow hyper)', () => {
    const enrollment = { ...madcowEnrollment(), inputs: { ...madcowEnrollment().inputs, hyper: { fiveRm: 20 } } };
    expect(validateEnrollment(MADCOW_5X5, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('hyper')]),
    );
  });

  it('rejects an input for a lift the template does not declare (clean)', () => {
    const enrollment = { ...madcowEnrollment(), inputs: { ...madcowEnrollment().inputs, clean: { fiveRm: 60 } } };
    expect(validateEnrollment(MADCOW_5X5, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('clean')]),
    );
  });

  it('rejects an input above 1000 (squat 1000.5)', () => {
    const enrollment = madcowEnrollment({ fiveRms: { squat: 1000.5 } });
    expect(validateEnrollment(MADCOW_5X5, enrollment)).toEqual(
      expect.arrayContaining([expect.stringContaining('squat')]),
    );
  });

  it('accepts an input of exactly 1000', () => {
    expect(validateEnrollment(MADCOW_5X5, madcowEnrollment({ fiveRms: { deadlift: 1000 } }))).toEqual([]);
  });
});
