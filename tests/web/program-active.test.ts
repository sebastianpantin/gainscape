import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type ProgramFact } from '@domain/index.ts';
import { type ProgramTemplateRow } from '../../web/src/lib/programs/program-enroll-rules.ts';
import { type EnrollmentRow } from '../../web/src/lib/programs/program-facts-rules.ts';
import { activeProgram } from '../../web/src/lib/programs/program-today-rules.ts';
import { factClock, sessionFact } from '../domain/program-fixtures/facts.ts';
import { MADCOW_5X5, madcowDaySets, MADCOW_EXERCISES, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';

const MADCOW_TEMPLATE: ProgramTemplateRow = {
  key: 'madcow_5x5',
  version: 1,
  name: 'Madcow 5x5',
  definition: MADCOW_5X5,
};

function enrollmentRow(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: '7a2f0c1e-1111-4111-8111-111111111111',
    template_key: 'madcow_5x5',
    template_version: 1,
    unit: 'kg',
    options: { rampStep: 0.125 },
    lift_bindings: { ...MADCOW_EXERCISES },
    inputs: {
      squat: { fiveRm: 100 },
      bench: { fiveRm: 80 },
      row: { fiveRm: 70 },
      press: { fiveRm: 50 },
      deadlift: { fiveRm: 140 },
    },
    rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    started_at: '2026-10-04T18:00:00.000Z',
    ended_at: null,
    ...overrides,
  };
}

const TEMPLATE_MISSING = {
  kind: 'template_missing',
  message: 'Program details unavailable — reconnect to load them',
};

describe('the active program', () => {
  it('is none without an enrollment', () => {
    expect(activeProgram([MADCOW_TEMPLATE], null, [])).toEqual({ kind: 'none' });
  });

  it('is template_missing when the cache has no template for the enrolled key', () => {
    expect(activeProgram([], enrollmentRow(), [])).toEqual(TEMPLATE_MISSING);
  });

  it('is template_missing when the cache has the key but not the enrolled version', () => {
    expect(activeProgram([MADCOW_TEMPLATE], enrollmentRow({ template_version: 2 }), [])).toEqual(TEMPLATE_MISSING);
  });

  it('needs an update when the enrolled template uses a primitive this app does not know', () => {
    const json = structuredClone(MADCOW_5X5) as unknown as { schedule: { kind: string } };
    json.schedule.kind = 'lunar';
    expect(activeProgram([{ ...MADCOW_TEMPLATE, definition: json }], enrollmentRow(), [])).toEqual({
      kind: 'needs_update',
      name: 'Madcow 5x5',
      message: 'Update the app to use this program',
    });
  });

  it('is ready with the state folded from the facts: Monday done puts the cursor on Wednesday', () => {
    const facts = [sessionFact(factClock().next(), weekDay(1, 'mon'), madcowDaySets('mon'))];
    const program = activeProgram([MADCOW_TEMPLATE], enrollmentRow(), facts);
    if (program.kind !== 'ready') throw new Error(`expected ready, got ${program.kind}`);
    expect(program.name).toBe('Madcow 5x5');
    expect(program.state.position).toEqual(weekDay(1, 'wed'));
    expect(program.state.completedDays).toEqual(['mon']);
  });
});

describe('the active program with malformed facts', () => {
  it('ignores a session fact whose sets are not a list instead of throwing', () => {
    const broken = {
      kind: 'session',
      id: 'broken',
      at: '2026-10-05T06:00:00.000Z',
      position: weekDay(1, 'mon'),
      sets: 'x',
    };
    const program = activeProgram([MADCOW_TEMPLATE], enrollmentRow(), [broken as unknown as ProgramFact]);
    if (program.kind !== 'ready') throw new Error(`expected ready, got ${program.kind}`);
    expect(program.state.position).toEqual(weekDay(1, 'mon'));
  });

  it('never throws for any list of cached values posing as facts', () => {
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 6 }), (facts) => {
        expect(() => activeProgram([MADCOW_TEMPLATE], enrollmentRow(), facts as ProgramFact[])).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('never throws for facts that have the right kind, id and time but arbitrary fields', () => {
    const kinds = fc.constantFrom('session', 'set_reference', 'skip_day', 'jump_to');
    const fact = fc.record({
      kind: kinds,
      id: fc.string({ minLength: 1 }),
      at: fc.constant('2026-10-05T06:00:00.000Z'),
      position: fc.anything(),
      sets: fc.anything(),
      lift: fc.anything(),
      var: fc.anything(),
      value: fc.anything(),
    });
    fc.assert(
      fc.property(fc.array(fact, { maxLength: 6 }), (facts) => {
        expect(() =>
          activeProgram([MADCOW_TEMPLATE], enrollmentRow(), facts as unknown as ProgramFact[]),
        ).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
});
