import { type DayDecl, type ProgramDefinition } from './program-definition.ts';

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

export function isCyclePosition(position: Position): position is CyclePosition {
  return 'cycle' in position;
}

export function isRotationPosition(position: Position): position is RotationPosition {
  return 'index' in position;
}

export function dayKeyOf(definition: ProgramDefinition, position: Position): string {
  if (!isRotationPosition(position)) return position.day;
  const days = definition.schedule.days;
  return days[((position.index % days.length) + days.length) % days.length].key;
}

export function dayOf(definition: ProgramDefinition, position: Position): DayDecl | undefined {
  const dayKey = dayKeyOf(definition, position);
  return definition.schedule.days.find((day) => day.key === dayKey);
}

function weekKeyOf(position: Position): number[] {
  if (isRotationPosition(position)) return [position.index];
  return isCyclePosition(position) ? [position.cycle, position.week] : [position.week];
}

export function dayIndexOf(definition: ProgramDefinition, dayKey: string): number {
  return definition.schedule.days.findIndex((day) => day.key === dayKey);
}

export function positionAt(week: Position, dayKey: string): Position {
  if (isRotationPosition(week)) return { index: week.index };
  return isCyclePosition(week) ? { cycle: week.cycle, week: week.week, day: dayKey } : { week: week.week, day: dayKey };
}

export function nextWeek(definition: ProgramDefinition, position: Position): Position {
  const schedule = definition.schedule;
  const firstDay = schedule.days[0].key;
  if (isRotationPosition(position)) return { index: position.index + 1 };
  if (!isCyclePosition(position)) return { week: position.week + 1, day: firstDay };
  const weeksPerCycle = schedule.kind === 'cycle' ? schedule.weeksPerCycle : Number.POSITIVE_INFINITY;
  return position.week >= weeksPerCycle
    ? { cycle: position.cycle + 1, week: 1, day: firstDay }
    : { cycle: position.cycle, week: position.week + 1, day: firstDay };
}

function compareNumberLists(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

export function compareWeeks(a: Position, b: Position): number {
  return compareNumberLists(weekKeyOf(a), weekKeyOf(b));
}

export function firstPosition(definition: ProgramDefinition): Position {
  const firstDay = definition.schedule.days[0].key;
  switch (definition.schedule.kind) {
    case 'cycle':
      return { cycle: 1, week: 1, day: firstDay };
    case 'weekly':
      return { week: 1, day: firstDay };
    case 'rotation':
      return { index: 0 };
  }
}

export function nextPosition(definition: ProgramDefinition, position: Position): Position {
  if (isRotationPosition(position)) return { index: position.index + 1 };
  const days = definition.schedule.days;
  const next = days[dayIndexOf(definition, position.day) + 1];
  return next ? positionAt(position, next.key) : nextWeek(definition, position);
}

export function comparePositions(definition: ProgramDefinition, a: Position, b: Position): number {
  const byWeek = compareWeeks(a, b);
  if (byWeek !== 0 || isRotationPosition(a) || isRotationPosition(b)) return byWeek;
  return dayIndexOf(definition, a.day) - dayIndexOf(definition, b.day);
}

export function availableDays(definition: ProgramDefinition, cursor: ScheduleCursor): Position[] {
  if (isRotationPosition(cursor.position)) return [cursor.position];
  return definition.schedule.days
    .filter((day) => !cursor.completedDays.includes(day.key))
    .map((day) => positionAt(cursor.position, day.key));
}

export function upcomingDays(definition: ProgramDefinition, cursor: ScheduleCursor, count: number): Position[] {
  const upcoming = availableDays(definition, cursor).slice(0, Math.max(count, 0));
  let week = cursor.position;
  while (upcoming.length < count) {
    week = nextWeek(definition, week);
    const weekDays = isRotationPosition(week)
      ? [week]
      : definition.schedule.days.map((day) => positionAt(week, day.key));
    upcoming.push(...weekDays.slice(0, count - upcoming.length));
  }
  return upcoming;
}

const MAX_PROGRAM_WEEKS = 520;

function isWholeNumberWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isPositionInSchedule(definition: ProgramDefinition, position: Position): boolean {
  const schedule = definition.schedule;
  const fields = position as Partial<CyclePosition & RotationPosition>;
  const knownDay = typeof fields.day === 'string' && dayIndexOf(definition, fields.day) >= 0;
  switch (schedule.kind) {
    case 'cycle': {
      if (fields.index !== undefined || !knownDay) return false;
      const maxCycle = Math.ceil(MAX_PROGRAM_WEEKS / schedule.weeksPerCycle);
      return (
        isWholeNumberWithin(fields.cycle, 1, maxCycle) && isWholeNumberWithin(fields.week, 1, schedule.weeksPerCycle)
      );
    }
    case 'weekly':
      return (
        fields.index === undefined &&
        fields.cycle === undefined &&
        knownDay &&
        isWholeNumberWithin(fields.week, 1, MAX_PROGRAM_WEEKS)
      );
    case 'rotation':
      return (
        fields.week === undefined &&
        fields.day === undefined &&
        fields.cycle === undefined &&
        isWholeNumberWithin(fields.index, 0, MAX_PROGRAM_WEEKS * schedule.days.length - 1)
      );
  }
}
