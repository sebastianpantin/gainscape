import { describe, expect, it } from 'vitest';
import { type ProgramFact, programStateAt, type SetReferenceFact } from '@domain/index.ts';
import { referenceEvents, referenceFieldKey, referenceFields } from '../../web/src/lib/program-reference-rules.ts';
import { type FactClock, factClock, setReferenceFact } from '../domain/program-fixtures/facts.ts';
import { followProgram } from '../domain/program-fixtures/follow.ts';
import { FIVE_THREE_ONE, fiveThreeOneEnrollment } from '../domain/program-fixtures/five_three_one.ts';
import { GZCLP, gzclpEnrollment } from '../domain/program-fixtures/gzclp.ts';
import { MADCOW_5X5, madcowEnrollment } from '../domain/program-fixtures/madcow_5x5.ts';

const fiveThreeOne = fiveThreeOneEnrollment({ oneRms: { squat: 100, bench: 80, deadlift: 140, press: 50 } });

function fiveThreeOneFields(facts: SetReferenceFact[] = []) {
  return referenceFields(FIVE_THREE_ONE, fiveThreeOne, programStateAt(FIVE_THREE_ONE, fiveThreeOne, facts));
}

const gzclp = gzclpEnrollment();

function gzclpFields(facts: readonly ProgramFact[] = []) {
  return referenceFields(GZCLP, gzclp, programStateAt(GZCLP, gzclp, facts));
}

function squatT1FailsEveryStage(clock: FactClock, earlierFacts: readonly ProgramFact[] = []): ProgramFact[] {
  const failedRotation = [{ missedLifts: ['squat-t1'] }, {}, {}, {}];
  const days = [...failedRotation, ...failedRotation, ...failedRotation];
  return followProgram(GZCLP, gzclp, clock, days, earlierFacts).facts;
}

function pendingSquatT1Fields() {
  return gzclpFields(squatT1FailsEveryStage(factClock()));
}

function fiveRmFieldsOf(fields: ReturnType<typeof gzclpFields>) {
  return fields.filter((field) => field.var === 'fiveRm').map((field) => [field.label, field.value]);
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

  it('lists no GZCLP 5RM field before a T1 fails its last stage', () => {
    expect(fiveRmFieldsOf(gzclpFields())).toEqual([]);
  });

  it('lists no 5RM field for a 5RM of 110 set before any last-stage fail', () => {
    const facts = [setReferenceFact(factClock().next(), 'squat-t1', 'fiveRm', 110)];
    expect(fiveRmFieldsOf(gzclpFields(facts))).toEqual([]);
  });

  it('lists an empty Squat T1 5RM field only, after the squat T1 fails 10×1', () => {
    expect(fiveRmFieldsOf(pendingSquatT1Fields())).toEqual([['Squat T1 5RM (kg)', null]]);
  });

  it('puts the pending Squat T1 5RM field right after the Squat T1 working weight', () => {
    expect(
      pendingSquatT1Fields()
        .slice(0, 2)
        .map((field) => field.label),
    ).toEqual(['Squat T1 working weight (kg)', 'Squat T1 5RM (kg)']);
  });

  it('lists the pending 5RM field empty even after an earlier 5RM of 110', () => {
    const clock = factClock();
    const facts = squatT1FailsEveryStage(clock, [setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 110)]);
    expect(fiveRmFieldsOf(gzclpFields(facts))).toEqual([['Squat T1 5RM (kg)', null]]);
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

  it('sends a set_reference for a 5RM entered into the pending empty field', () => {
    expect(referenceEvents(pendingSquatT1Fields(), { 'squat-t1.fiveRm': '110' })).toEqual({
      kind: 'ok',
      events: [{ kind: 'set_reference', lift: 'squat-t1', var: 'fiveRm', value: 110 }],
    });
  });

  it('sends the same 5RM of 110 again when an earlier cycle already set 110', () => {
    const clock = factClock();
    const facts = squatT1FailsEveryStage(clock, [setReferenceFact(clock.next(), 'squat-t1', 'fiveRm', 110)]);
    expect(referenceEvents(gzclpFields(facts), { 'squat-t1.fiveRm': '110' })).toEqual({
      kind: 'ok',
      events: [{ kind: 'set_reference', lift: 'squat-t1', var: 'fiveRm', value: 110 }],
    });
  });

  it('sends nothing and finds no problem for a pending 5RM field left or cleared empty', () => {
    expect(referenceEvents(pendingSquatT1Fields(), { 'squat-t1.fiveRm': '  ' })).toEqual({ kind: 'ok', events: [] });
    expect(referenceEvents(pendingSquatT1Fields(), { 'squat-t1.fiveRm': '' })).toEqual({ kind: 'ok', events: [] });
  });

  it.each(['0', '-5', 'abc'])('refuses %j typed into the pending empty 5RM field', (raw) => {
    expect(referenceEvents(pendingSquatT1Fields(), { 'squat-t1.fiveRm': raw })).toEqual({
      kind: 'invalid',
      problems: ['Squat T1 5RM (kg) must be above 0 and at most 1000'],
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

  it('accepts an lb training max above 1000 up to the 2205 lb cap', () => {
    const enrollment = fiveThreeOneEnrollment({ unit: 'lb', tms: { squat: 900 } });
    const fields = referenceFields(FIVE_THREE_ONE, enrollment, programStateAt(FIVE_THREE_ONE, enrollment, []));
    expect(referenceEvents(fields, { 'squat.tm': '1100', 'bench.tm': '2206' })).toEqual({
      kind: 'invalid',
      problems: ['Bench press training max (lb) must be above 0 and at most 2205'],
    });
    expect(referenceEvents(fields, { 'squat.tm': '1100' })).toEqual({
      kind: 'ok',
      events: [{ kind: 'set_reference', lift: 'squat', var: 'tm', value: 1100 }],
    });
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
