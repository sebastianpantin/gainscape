import {
  type LastLoggedWeights,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramState,
  type WeightUnit,
} from '@domain/index.ts';
import { type PrescriptionCard } from './program-today-rules.ts';

export const ROTATION_PLAN_SESSIONS = 3;

export type PlanDayStatus = 'completed' | 'skipped' | 'upcoming';

export interface PlanDay {
  position: Position;
  label: string;
  status: PlanDayStatus;
  cards: PrescriptionCard[];
}

export interface ProgramPlan {
  title: string;
  days: PlanDay[];
}

export interface PlanContext {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  state: ProgramState;
  unit: WeightUnit;
  exerciseNames: ReadonlyMap<string, string>;
  lastLogged?: LastLoggedWeights;
}

export function programPlan(context: PlanContext): ProgramPlan {
  const { definition, state, unit } = context;
  throw new Error(`programPlan is not implemented: ${definition.key} at ${JSON.stringify(state.position)} in ${unit}`);
}

export function planStatusText(status: PlanDayStatus): string | null {
  throw new Error(`planStatusText is not implemented: ${status}`);
}
