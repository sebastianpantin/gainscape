import { type RoundingSetting } from './load-rounding.ts';
import { type ProgramDefinition, type ProgramEnrollment } from './program-definition.ts';
import { type PrescriptionSnapshot } from './program-prescription.ts';
import { type LiftOutcome, type ProgramFact, type ProgramState, type SessionFact } from './program-state.ts';
import { type WeightUnit } from './units.ts';

export interface LoggedLoad {
  weightKg: number;
  reps: number;
}

export const WEEKS_BACK_FACTOR = 0.975;

export const isSetMet: (
  logged: LoggedLoad,
  snapshot: PrescriptionSnapshot,
  rounding: RoundingSetting,
  unit: WeightUnit,
) => boolean = () => {
  throw new Error('not implemented');
};

export const liftOutcomes: (
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  session: SessionFact,
) => Readonly<Record<string, LiftOutcome>> = () => {
  throw new Error('not implemented');
};

export const weeksBack: (top: number, weeks: number) => number = () => {
  throw new Error('not implemented');
};

export const advanceProgram: (
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ProgramState,
  fact: ProgramFact,
) => ProgramState = () => {
  throw new Error('not implemented');
};
