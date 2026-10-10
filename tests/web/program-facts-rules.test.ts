import { describe, expect, it } from 'vitest';
import { type ProgramFact, programStateAt } from '@domain/index.ts';
import {
  type EnrollmentEventRow,
  type EnrollmentFactsRows,
  type EnrollmentRow,
  enrollmentFromRow,
  type FactSetRow,
  type LinkedSessionRow,
  programFactsFromRows,
} from '../../web/src/lib/program-facts-rules.ts';
import { MADCOW_5X5, MADCOW_EXERCISES, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';

const ENROLLMENT_ID = '7a2f0c1e-1111-4111-8111-111111111111';
const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

function enrollmentRow(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: ENROLLMENT_ID,
    template_key: 'madcow_5x5',
    template_version: 1,
    unit: 'kg',
    options: { rampStep: 0.125 },
    lift_bindings: { ...MADCOW_EXERCISES, situp: null },
    inputs: {
      squat: { fiveRm: 100 },
      bench: { fiveRm: 80 },
      row: { fiveRm: 70 },
      press: { fiveRm: 50 },
      deadlift: { fiveRm: 140 },
    },
    rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    started_at: '2026-10-04T18:00:00.000000+00:00',
    ended_at: null,
    ...overrides,
  };
}

function setRow(overrides: Partial<FactSetRow> = {}): FactSetRow {
  return {
    ref: 'mon-squat:0',
    exercise_id: MADCOW_EXERCISES.squat,
    weight_kg: 70,
    reps: 5,
    effort_input_type: 'rir',
    effort_value: 2,
    prescribed_weight_kg: 70,
    prescribed_reps: 5,
    prescribed_min_reps: null,
    prescribed_amrap: false,
    ...overrides,
  };
}

function sessionRow(overrides: Partial<LinkedSessionRow> = {}): LinkedSessionRow {
  return {
    id: 'session-monday',
    completed_at: '2026-10-05T07:00:00.123456+00:00',
    program_position: { week: 1, day: 'mon' },
    sets: [setRow()],
    ...overrides,
  };
}

function rows(events: EnrollmentEventRow[], sessions: LinkedSessionRow[]): EnrollmentFactsRows {
  return { enrollment: enrollmentRow(), events, sessions };
}

function factById(facts: readonly ProgramFact[], id: string): ProgramFact | undefined {
  return facts.find((fact) => fact.id === id);
}

describe('enrollmentFromRow', () => {
  it('maps lift_bindings to bindings and keeps the id, unit, options, inputs and rounding', () => {
    const row = enrollmentRow();
    expect(enrollmentFromRow(row)).toEqual({
      id: ENROLLMENT_ID,
      unit: 'kg',
      options: { rampStep: 0.125 },
      bindings: { ...MADCOW_EXERCISES, situp: null },
      inputs: row.inputs,
      rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    });
  });
});

describe('programFactsFromRows', () => {
  it('maps a linked session to a session fact at its completion time in UTC ISO form', () => {
    const facts = programFactsFromRows(rows([], [sessionRow()]));
    expect(facts).toEqual([
      {
        kind: 'session',
        id: 'session-monday',
        at: '2026-10-05T07:00:00.123Z',
        position: { week: 1, day: 'mon' },
        sets: [
          {
            exerciseId: MADCOW_EXERCISES.squat,
            weightKg: 70,
            reps: 5,
            effortInputType: 'rir',
            effortValue: 2,
            prescription: { ref: 'mon-squat:0', weightKg: 70, reps: 5, minReps: null, amrap: false },
          },
        ],
      },
    ]);
  });

  it('leaves out a carry or hang logged in a program session, which has no reps', () => {
    const carry = setRow({ ref: null, reps: null, weight_kg: 32, prescribed_weight_kg: null, prescribed_reps: null });
    const [fact] = programFactsFromRows(rows([], [sessionRow({ sets: [carry, setRow()] })]));
    expect(fact.kind === 'session' && fact.sets.map((set) => set.reps)).toEqual([5]);
  });

  it('keeps the instant of a completion time written with another offset', () => {
    const [fact] = programFactsFromRows(rows([], [sessionRow({ completed_at: '2026-10-05T09:00:00+02:00' })]));
    expect(fact.at).toBe('2026-10-05T07:00:00.000Z');
  });

  it('maps the minimum reps and the amrap flag of a snapshot', () => {
    const top = setRow({ ref: 'fri-squat:4', prescribed_reps: 3, prescribed_min_reps: 3, prescribed_amrap: true });
    const [fact] = programFactsFromRows(rows([], [sessionRow({ sets: [top] })]));
    expect(fact.kind === 'session' && fact.sets[0].prescription).toEqual({
      ref: 'fri-squat:4',
      weightKg: 70,
      reps: 3,
      minReps: 3,
      amrap: true,
    });
  });

  it('maps a set without a ref to a set without a prescription, keeping its effort', () => {
    const unprescribed = setRow({
      ref: null,
      effort_input_type: 'rpe',
      effort_value: 8.5,
      prescribed_weight_kg: null,
      prescribed_reps: null,
      prescribed_min_reps: null,
      prescribed_amrap: null,
    });
    const [fact] = programFactsFromRows(rows([], [sessionRow({ sets: [unprescribed] })]));
    expect(fact.kind === 'session' && fact.sets).toEqual([
      {
        exerciseId: MADCOW_EXERCISES.squat,
        weightKg: 70,
        reps: 5,
        effortInputType: 'rpe',
        effortValue: 8.5,
        prescription: null,
      },
    ]);
  });

  it('maps a set_reference event to a set_reference fact at its effective time', () => {
    const event: EnrollmentEventRow = {
      id: 'event-1',
      kind: 'set_reference',
      payload: { lift: 'squat', var: 'top', value: 95 },
      effective_at: '2026-10-05T05:00:00.5+00:00',
    };
    expect(programFactsFromRows(rows([event], []))).toEqual([
      { kind: 'set_reference', id: 'event-1', at: '2026-10-05T05:00:00.500Z', lift: 'squat', var: 'top', value: 95 },
    ]);
  });

  it.each(['skip_day', 'jump_to'] as const)('maps a %s event to a fact with its position', (kind) => {
    const event: EnrollmentEventRow = {
      id: `event-${kind}`,
      kind,
      payload: { position: { week: 3, day: 'wed' } },
      effective_at: '2026-10-05T05:00:00+00:00',
    };
    expect(programFactsFromRows(rows([event], []))).toEqual([
      { kind, id: `event-${kind}`, at: '2026-10-05T05:00:00.000Z', position: { week: 3, day: 'wed' } },
    ]);
  });

  it('leaves out an event of a kind it does not know instead of throwing', () => {
    const unknown: EnrollmentEventRow = {
      id: 'event-later',
      kind: 'tm_test',
      payload: {},
      effective_at: '2026-10-05T05:00:00+00:00',
    };
    expect(programFactsFromRows(rows([unknown], [sessionRow()])).map((fact) => fact.id)).toEqual(['session-monday']);
  });

  it('returns every event and session, each with an explicit zone on its time', () => {
    const event: EnrollmentEventRow = {
      id: 'event-1',
      kind: 'set_reference',
      payload: { lift: 'squat', var: 'top', value: 95 },
      effective_at: '2026-10-05T05:00:00+00:00',
    };
    const facts = programFactsFromRows(rows([event], [sessionRow(), sessionRow({ id: 'session-wednesday' })]));
    expect(facts.map((fact) => fact.id).sort()).toEqual(['event-1', 'session-monday', 'session-wednesday']);
    for (const fact of facts) expect(fact.at, fact.id).toMatch(EXPLICIT_ZONE);
    expect(factById(facts, 'event-1')?.kind).toBe('set_reference');
  });

  it('feeds the engine: a mapped week 1 Monday session makes week 1 Wednesday next', () => {
    const facts = programFactsFromRows(rows([], [sessionRow()]));
    const state = programStateAt(MADCOW_5X5, enrollmentFromRow(enrollmentRow()), facts);
    expect(state.position).toEqual(weekDay(1, 'wed'));
  });

  it('feeds the engine: a mapped jump_to week 3 Monday moves the position there', () => {
    const jump: EnrollmentEventRow = {
      id: 'event-jump',
      kind: 'jump_to',
      payload: { position: { week: 3, day: 'mon' } },
      effective_at: '2026-10-05T05:00:00+00:00',
    };
    const state = programStateAt(
      MADCOW_5X5,
      enrollmentFromRow(enrollmentRow()),
      programFactsFromRows(rows([jump], [])),
    );
    expect(state.position).toEqual(weekDay(3, 'mon'));
  });
});
