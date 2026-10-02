import { type ProgramDefinition } from './program-definition.ts';

export interface CyclePosition {
  cycle: number;
  week: number;
  day: string;
}

export interface WeeklyPosition {
  week: number;
  day: string;
}

export interface RotationPosition {
  index: number;
}

export type Position = CyclePosition | WeeklyPosition | RotationPosition;

export interface ScheduleCursor {
  position: Position;
  completedDays: readonly string[];
}

export const firstPosition: (definition: ProgramDefinition) => Position = () => {
  throw new Error('not implemented');
};

export const nextPosition: (definition: ProgramDefinition, position: Position) => Position = () => {
  throw new Error('not implemented');
};

export const comparePositions: (definition: ProgramDefinition, a: Position, b: Position) => number = () => {
  throw new Error('not implemented');
};

export const availableDays: (definition: ProgramDefinition, cursor: ScheduleCursor) => Position[] = () => {
  throw new Error('not implemented');
};

export const upcomingDays: (
  definition: ProgramDefinition,
  cursor: ScheduleCursor,
  count: number,
) => Position[] = () => {
  throw new Error('not implemented');
};
