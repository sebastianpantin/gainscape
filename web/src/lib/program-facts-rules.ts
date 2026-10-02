import {
  type EffortInputType,
  type OptionValue,
  type Position,
  type ProgramEnrollment,
  type ProgramFact,
  type RoundingSetting,
  type WeightUnit,
} from '@domain/index.ts';

export interface EnrollmentRow {
  id: string;
  template_key: string;
  template_version: number;
  unit: WeightUnit;
  options: Record<string, OptionValue>;
  lift_bindings: Record<string, string | null>;
  inputs: Record<string, Record<string, number>>;
  rounding: RoundingSetting;
  started_at: string;
  ended_at: string | null;
}

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
  reps: number;
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
  void row;
  throw new Error('not implemented');
}

export function programFactsFromRows(rows: EnrollmentFactsRows): ProgramFact[] {
  void rows;
  throw new Error('not implemented');
}
