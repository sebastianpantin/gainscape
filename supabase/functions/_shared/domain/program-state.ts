import {
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramReferences,
  type ReferenceVar,
} from './program-definition.ts';
import { type PrescriptionSnapshot } from './program-prescription.ts';
import { type Position, type ScheduleCursor } from './program-schedule.ts';
import { type EffortInputType } from './types.ts';

export interface FactSet {
  exerciseId: string;
  weightKg: number;
  reps: number;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  prescription: PrescriptionSnapshot | null;
}

interface FactBase {
  id: string;
  at: string;
  local?: boolean;
}

export interface SessionFact extends FactBase {
  kind: 'session';
  position: Position;
  sets: FactSet[];
}

export interface SetReferenceFact extends FactBase {
  kind: 'set_reference';
  lift: string;
  var: ReferenceVar;
  value: number;
}

export interface SkipDayFact extends FactBase {
  kind: 'skip_day';
  position: Position;
}

export interface JumpToFact extends FactBase {
  kind: 'jump_to';
  position: Position;
}

export type ProgramFact = SessionFact | SetReferenceFact | SkipDayFact | JumpToFact;

export type LiftOutcome = 'met' | 'missed' | 'neutral';

export type ReferenceChangeReason = 'increment' | 'tmReset' | 'set_reference' | 'adjustment';

export interface ReferenceChange {
  lift: string;
  var: ReferenceVar;
  from: number;
  to: number;
  reason: ReferenceChangeReason;
  position: Position;
}

export interface DayRecord {
  position: Position;
  status: 'completed' | 'skipped';
  outcomes: Readonly<Record<string, LiftOutcome>>;
  judgedSets: readonly FactSet[];
}

export interface ProgramState extends ScheduleCursor {
  refs: ProgramReferences;
  consecutiveMisses: Readonly<Record<string, number>>;
  days: readonly DayRecord[];
  appliedFactIds: readonly string[];
  history: readonly ReferenceChange[];
}

export const initialProgramState: (
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
) => ProgramState = () => {
  throw new Error('not implemented');
};

export const orderFacts: (facts: readonly ProgramFact[]) => ProgramFact[] = () => {
  throw new Error('not implemented');
};

export const programStateAt: (
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  facts: readonly ProgramFact[],
) => ProgramState = () => {
  throw new Error('not implemented');
};
