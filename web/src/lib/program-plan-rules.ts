import {
  comparePositions,
  isCyclePosition,
  isRotationPosition,
  type LastLoggedWeights,
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramState,
  resolvePrescription,
  upcomingDays,
  type WeightUnit,
} from '@domain/index.ts';
import { positionLabel, type PrescriptionCard, prescriptionCards } from './program-today-rules.ts';

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

function planPositions(definition: ProgramDefinition, state: ProgramState): Position[] {
  const { position } = state;
  const schedule = definition.schedule;
  if (isRotationPosition(position)) return upcomingDays(definition, state, ROTATION_PLAN_SESSIONS);
  if (!isCyclePosition(position) || schedule.kind !== 'cycle')
    return schedule.days.map((day) => ({ week: position.week, day: day.key }));
  return Array.from({ length: schedule.weeksPerCycle }, (_, index) => index + 1).flatMap((week) =>
    schedule.days.map((day) => ({ cycle: position.cycle, week, day: day.key })),
  );
}

function dayStatus(definition: ProgramDefinition, state: ProgramState, position: Position): PlanDayStatus {
  const record = state.days.find(
    (day) => day.epoch === state.epoch && comparePositions(definition, day.position, position) === 0,
  );
  if (record) return record.status;
  if (isRotationPosition(position) || isRotationPosition(state.position)) return 'upcoming';
  const before = comparePositions(definition, position, state.position) < 0;
  const passed = isInCurrentWeek(position, state.position)
    ? state.completedDays.includes(position.day) || (before && !isOptionalDay(definition, position.day))
    : before;
  return passed ? 'skipped' : 'upcoming';
}

function isInCurrentWeek(position: Position, current: Position): boolean {
  if (isRotationPosition(position) || isRotationPosition(current)) return false;
  const sameCycle = !isCyclePosition(position) || !isCyclePosition(current) || position.cycle === current.cycle;
  return sameCycle && position.week === current.week;
}

function isOptionalDay(definition: ProgramDefinition, dayKey: string): boolean {
  return definition.schedule.days.some((day) => day.key === dayKey && day.optional === true);
}

function planTitle(position: Position): string {
  if (isRotationPosition(position)) return 'Next sessions';
  return isCyclePosition(position) ? `Cycle ${position.cycle}` : `Week ${position.week}`;
}

export function programPlan(context: PlanContext): ProgramPlan {
  const { definition, enrollment, state, unit, exerciseNames } = context;
  return {
    title: planTitle(state.position),
    days: planPositions(definition, state).map((position) => {
      const status = dayStatus(definition, state, position);
      const slots =
        status === 'upcoming'
          ? resolvePrescription(definition, enrollment, state, position, context.lastLogged ?? {})
          : [];
      return {
        position,
        label: positionLabel(definition, position),
        status,
        cards: prescriptionCards(definition, slots, unit, exerciseNames),
      };
    }),
  };
}

const PLAN_STATUS_TEXT: Readonly<Record<PlanDayStatus, string | null>> = {
  completed: 'Done',
  skipped: 'Skipped',
  upcoming: null,
};

export function planStatusText(status: PlanDayStatus): string | null {
  return PLAN_STATUS_TEXT[status];
}
