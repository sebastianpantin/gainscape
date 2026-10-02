import {
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramReferences,
  type SlotRole,
} from './program-definition.ts';
import { type Position } from './program-schedule.ts';

export interface PrescriptionSnapshot {
  ref: string;
  weightKg: number;
  reps: number;
  minReps: number | null;
  amrap: boolean;
}

export interface PrescribedSet {
  ref: string;
  weight: number | null;
  weightKg: number | null;
  pct: number | null;
  reps: number | null;
  maxReps: number | null;
  minReps: number | null;
  amrap: boolean;
  optional: boolean;
  snapshot: PrescriptionSnapshot | null;
}

export interface PrescribedExercise {
  kind: 'exercise';
  slotId: string;
  lift: string;
  exerciseId: string;
  role: SlotRole;
  sets: PrescribedSet[];
}

export interface UnsupportedPrescription {
  kind: 'unsupported';
  slotId: string;
  lift: string;
  primitive: string;
}

export type ResolvedSlot = PrescribedExercise | UnsupportedPrescription;

export type LastLoggedWeights = Readonly<Record<string, number>>;

export interface ReferenceState {
  refs: ProgramReferences;
}

export const resolvePrescription: (
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ReferenceState,
  position: Position,
  lastLogged: LastLoggedWeights,
) => ResolvedSlot[] = () => {
  throw new Error('not implemented');
};
