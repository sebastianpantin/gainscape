import { type Position, type ProgramDefinition } from '@domain/index.ts';
import { positionLabel } from './program-today-rules.ts';

export const SKIP_OFFLINE_TEXT = "You're offline. Skipping a day needs a connection.";

export const SKIP_CONFIRM_LABEL = 'Skip day';

export interface SkipDayEvent {
  kind: 'skip_day';
  position: Position;
}

export function skipLabel(definition: ProgramDefinition, position: Position): string {
  return `Skip ${positionLabel(definition, position)}`;
}

export function skipDialogTitle(definition: ProgramDefinition, position: Position): string {
  return `${skipLabel(definition, position)}?`;
}

export function skipDayEvent(position: Position): SkipDayEvent {
  return { kind: 'skip_day', position };
}
