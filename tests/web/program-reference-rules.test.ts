import { describe, expect, it } from 'vitest';
import { programStateAt, type SetReferenceFact } from '@domain/index.ts';
import { referenceEvents, referenceFieldKey, referenceFields } from '../../web/src/lib/program-reference-rules.ts';
import { factClock, setReferenceFact } from '../domain/program-fixtures/facts.ts';
import { FIVE_THREE_ONE, fiveThreeOneEnrollment } from '../domain/program-fixtures/five_three_one.ts';
import { MADCOW_5X5, madcowEnrollment } from '../domain/program-fixtures/madcow_5x5.ts';

const fiveThreeOne = fiveThreeOneEnrollment({ oneRms: { squat: 100, bench: 80, deadlift: 140, press: 50 } });

function fiveThreeOneFields(facts: SetReferenceFact[] = []) {
  return referenceFields(FIVE_THREE_ONE, fiveThreeOne, programStateAt(FIVE_THREE_ONE, fiveThreeOne, facts));
}

describe('reference fields', () => {
  it('lists one training max field per 5/3/1 lift, from 1RMs of 100/80/140/50 kg at 90%', () => {
    expect(fiveThreeOneFields().map((field) => [field.label, field.value])).toEqual([
      ['Squat training max (kg)', 90],
      ['Bench press training max (kg)', 72],
      ['Deadlift training max (kg)', 126],
      ['Overhead press training max (kg)', 45],
    ]);
  });

  it('lists the Madcow top sets unrounded to two decimals (100 × 0.975^3 = 92.69)', () => {
    const enrollment = madcowEnrollment();
    const fields = referenceFields(MADCOW_5X5, enrollment, programStateAt(MADCOW_5X5, enrollment, []));
    expect(fields.map((field) => [field.lift, field.var, field.label, field.value])).toEqual([
      ['squat', 'top', 'Squat top set (kg)', 92.69],
      ['bench', 'top', 'Bench press top set (kg)', 74.15],
      ['row', 'top', 'Barbell row top set (kg)', 64.88],
      ['press', 'top', 'Incline or military press top set (kg)', 46.34],
      ['deadlift', 'top', 'Deadlift top set (kg)', 129.76],
    ]);
  });

  it('shows an edited training max after its set_reference fact', () => {
    const facts = [setReferenceFact(factClock().next(), 'squat', 'tm', 100)];
    expect(fiveThreeOneFields(facts)[0].value).toBe(100);
  });

  it('labels the fields in pounds for a pound enrollment', () => {
    const enrollment = fiveThreeOneEnrollment({ unit: 'lb', tms: { squat: 283.5 } });
    const fields = referenceFields(FIVE_THREE_ONE, enrollment, programStateAt(FIVE_THREE_ONE, enrollment, []));
    expect(fields[0]).toMatchObject({ label: 'Squat training max (lb)', value: 283.5 });
  });

  it('keys a field by lift and reference var', () => {
    expect(referenceFieldKey({ lift: 'squat', var: 'tm' })).toBe('squat.tm');
  });
});

describe('reference events', () => {
  it('sends one set_reference for the edited training max only', () => {
    const fields = fiveThreeOneFields();
    expect(referenceEvents(fields, { 'squat.tm': '100', 'bench.tm': '72' })).toEqual({
      kind: 'ok',
      events: [{ kind: 'set_reference', lift: 'squat', var: 'tm', value: 100 }],
    });
  });

  it('sends nothing when no value changed', () => {
    expect(referenceEvents(fiveThreeOneFields(), {})).toEqual({ kind: 'ok', events: [] });
  });

  it('treats a value equal to the shown two-decimal value as unchanged', () => {
    const enrollment = madcowEnrollment();
    const fields = referenceFields(MADCOW_5X5, enrollment, programStateAt(MADCOW_5X5, enrollment, []));
    expect(referenceEvents(fields, { 'squat.top': '92.69' })).toEqual({ kind: 'ok', events: [] });
  });

  it('refuses an empty, zero or above-1000 value by its field label', () => {
    expect(referenceEvents(fiveThreeOneFields(), { 'squat.tm': '', 'bench.tm': '0', 'press.tm': '1001' })).toEqual({
      kind: 'invalid',
      problems: [
        'Enter Squat training max (kg)',
        'Bench press training max (kg) must be above 0 and at most 1000',
        'Overhead press training max (kg) must be above 0 and at most 1000',
      ],
    });
  });
});
