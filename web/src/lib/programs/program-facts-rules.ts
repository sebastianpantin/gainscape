import {
  type EffortInputType,
  type FactSet,
  type Position,
  type PrescriptionSnapshot,
  type ProgramEnrollment,
  type ProgramFact,
  type ReferenceVar,
} from '@domain/index.ts';
import { z } from 'zod';

export const enrollmentRowSchema = z.object({
  id: z.string(),
  template_key: z.string(),
  template_version: z.number(),
  unit: z.enum(['kg', 'lb']),
  options: z.record(z.string(), z.union([z.string(), z.number()])),
  lift_bindings: z.record(z.string(), z.string().nullable()),
  inputs: z.record(z.string(), z.record(z.string(), z.number())),
  rounding: z.object({ increment: z.number(), mode: z.enum(['nearest', 'down']), barWeight: z.number() }),
  started_at: z.string(),
  ended_at: z.string().nullable(),
});

export type EnrollmentRow = z.infer<typeof enrollmentRowSchema>;

export interface EnrollmentEventRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  effective_at: string;
}

export interface FactSetRow {
  ref: string | null;
  exercise_id: string;
  weight_kg: number;
  reps: number | null;
  effort_input_type: EffortInputType | null;
  effort_value: number | null;
  prescribed_weight_kg: number | null;
  prescribed_reps: number | null;
  prescribed_min_reps: number | null;
  prescribed_amrap: boolean | null;
}

export interface LinkedSessionRow {
  id: string;
  completed_at: string;
  program_position: Position;
  sets: FactSetRow[];
}

export interface EnrollmentFactsRows {
  enrollment: EnrollmentRow;
  events: EnrollmentEventRow[];
  sessions: LinkedSessionRow[];
}

export function enrollmentFromRow(row: EnrollmentRow): ProgramEnrollment {
  return {
    id: row.id,
    unit: row.unit,
    options: row.options,
    bindings: row.lift_bindings,
    inputs: row.inputs,
    rounding: row.rounding,
  };
}

function utcIso(timestamp: string): string {
  return new Date(timestamp).toISOString();
}

function snapshotFromRow(row: FactSetRow): PrescriptionSnapshot | null {
  if (row.ref === null || row.prescribed_weight_kg === null || row.prescribed_reps === null) return null;
  return {
    ref: row.ref,
    weightKg: row.prescribed_weight_kg,
    reps: row.prescribed_reps,
    minReps: row.prescribed_min_reps,
    amrap: row.prescribed_amrap === true,
  };
}

function factSetsFromRow(row: FactSetRow): FactSet[] {
  if (row.reps === null) return [];
  return [
    {
      exerciseId: row.exercise_id,
      weightKg: row.weight_kg,
      reps: row.reps,
      effortInputType: row.effort_input_type,
      effortValue: row.effort_value,
      prescription: snapshotFromRow(row),
    },
  ];
}

function eventFact(row: EnrollmentEventRow): ProgramFact[] {
  const base = { id: row.id, at: utcIso(row.effective_at) };
  switch (row.kind) {
    case 'set_reference':
      return [
        {
          kind: 'set_reference',
          ...base,
          lift: row.payload.lift as string,
          var: row.payload.var as ReferenceVar,
          value: row.payload.value as number,
        },
      ];
    case 'skip_day':
    case 'jump_to':
      return [{ kind: row.kind, ...base, position: row.payload.position as Position }];
    default:
      return [];
  }
}

export function programFactsFromRows(rows: EnrollmentFactsRows): ProgramFact[] {
  const sessions = rows.sessions.map((session): ProgramFact => ({
    kind: 'session',
    id: session.id,
    at: utcIso(session.completed_at),
    position: session.program_position,
    sets: session.sets.flatMap(factSetsFromRow),
  }));
  return [...rows.events.flatMap(eventFact), ...sessions];
}

const positionSchema = z.union([
  z.object({ cycle: z.number(), week: z.number(), day: z.string() }),
  z.object({ week: z.number(), day: z.string() }),
  z.object({ index: z.number() }),
]);

const snapshotSchema = z.object({
  ref: z.string(),
  weightKg: z.number(),
  reps: z.number(),
  minReps: z.number().nullable(),
  amrap: z.boolean(),
});

const factSetSchema = z.object({
  exerciseId: z.string(),
  weightKg: z.number(),
  reps: z.number(),
  effortInputType: z.enum(['level', 'rir', 'rpe', 'cardio']).nullable(),
  effortValue: z.number().nullable(),
  prescription: snapshotSchema.nullable(),
});

const factStamp = { id: z.string(), at: z.string(), local: z.boolean().optional() };

export const sessionFactSchema = z.object({
  kind: z.literal('session'),
  ...factStamp,
  position: positionSchema,
  sets: z.array(factSetSchema),
});

export const programFactSchema = z.discriminatedUnion('kind', [
  sessionFactSchema,
  z.object({
    kind: z.literal('set_reference'),
    ...factStamp,
    lift: z.string(),
    var: z.enum(['tm', 'top', 'fiveRm', 'e1rm', 'workingWeight']),
    value: z.number(),
  }),
  z.object({ kind: z.literal('skip_day'), ...factStamp, position: positionSchema }),
  z.object({ kind: z.literal('jump_to'), ...factStamp, position: positionSchema }),
]);

export const enrollmentFactsRowsSchema: z.ZodType<EnrollmentFactsRows> = z.object({
  enrollment: enrollmentRowSchema,
  events: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      payload: z.record(z.string(), z.unknown()),
      effective_at: z.string(),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.string(),
      completed_at: z.string(),
      program_position: positionSchema,
      sets: z.array(
        z.object({
          ref: z.string().nullable(),
          exercise_id: z.string(),
          weight_kg: z.number(),
          reps: z.number().nullable(),
          effort_input_type: z.enum(['level', 'rir', 'rpe', 'cardio']).nullable(),
          effort_value: z.number().nullable(),
          prescribed_weight_kg: z.number().nullable(),
          prescribed_reps: z.number().nullable(),
          prescribed_min_reps: z.number().nullable(),
          prescribed_amrap: z.boolean().nullable(),
        }),
      ),
    }),
  ),
});

export function isProgramFact(value: unknown): value is ProgramFact {
  return programFactSchema.safeParse(value).success;
}
