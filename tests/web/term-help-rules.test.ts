import { programStateAt } from '@domain/index.ts';
import { describe, expect, it } from 'vitest';
import { initialEnrollForm, inputFields } from '../../web/src/lib/program-enroll-rules.ts';
import { referenceFields } from '../../web/src/lib/program-reference-rules.ts';
import {
  INPUT_KIND_GLOSSARY,
  inputHelpKeys,
  REFERENCE_VAR_GLOSSARY,
  referenceHelpKeys,
} from '../../web/src/lib/term-help-rules.ts';
import { FIVE_THREE_ONE, fiveThreeOneEnrollment } from '../domain/program-fixtures/five_three_one.ts';
import { STRONGLIFTS_5X5, strongLiftsEnrollment } from '../domain/program-fixtures/stronglifts_5x5.ts';

describe('glossary mappings', () => {
  it('explains every enroll input kind except working weight', () => {
    expect(INPUT_KIND_GLOSSARY).toEqual({
      oneRm: 'oneRm',
      tm: 'trainingMax',
      fiveRm: 'fiveRm',
      e1rm: 'e1rm',
      workingWeight: null,
    });
  });

  it('explains every reference variable except top set and working weight', () => {
    expect(REFERENCE_VAR_GLOSSARY).toEqual({
      tm: 'trainingMax',
      top: null,
      fiveRm: 'fiveRm',
      e1rm: 'e1rm',
      workingWeight: null,
    });
  });
});

describe('inputHelpKeys', () => {
  it('explains 1RM and training max once for the 5/3/1 form, which offers both per lift', () => {
    expect(inputHelpKeys(inputFields(FIVE_THREE_ONE, initialEnrollForm(FIVE_THREE_ONE, 'kg', [])))).toEqual([
      'oneRm',
      'trainingMax',
    ]);
  });

  it('explains nothing for the StrongLifts form, which asks only for working weights', () => {
    expect(inputHelpKeys(inputFields(STRONGLIFTS_5X5, initialEnrollForm(STRONGLIFTS_5X5, 'kg', [])))).toEqual([]);
  });

  it('keeps the first-seen order across fields', () => {
    expect(inputHelpKeys([{ kinds: ['fiveRm', 'workingWeight'] }, { kinds: ['e1rm', 'fiveRm'] }])).toEqual([
      'fiveRm',
      'e1rm',
    ]);
  });
});

describe('referenceHelpKeys', () => {
  it('explains the training max once for the 5/3/1 reference form', () => {
    const enrollment = fiveThreeOneEnrollment({ oneRms: { squat: 100, bench: 80, deadlift: 140, press: 50 } });
    const fields = referenceFields(FIVE_THREE_ONE, enrollment, programStateAt(FIVE_THREE_ONE, enrollment, []));
    expect(referenceHelpKeys(fields)).toEqual(['trainingMax']);
  });

  it('explains nothing for the StrongLifts reference form', () => {
    const enrollment = strongLiftsEnrollment();
    const fields = referenceFields(STRONGLIFTS_5X5, enrollment, programStateAt(STRONGLIFTS_5X5, enrollment, []));
    expect(referenceHelpKeys(fields)).toEqual([]);
  });

  it('keeps the first-seen order and drops unexplained variables', () => {
    expect(referenceHelpKeys([{ var: 'top' }, { var: 'e1rm' }, { var: 'tm' }, { var: 'e1rm' }])).toEqual([
      'e1rm',
      'trainingMax',
    ]);
  });
});
