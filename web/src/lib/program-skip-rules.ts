import { type Position, type ProgramDefinition } from '@domain/index.ts';

export const SKIP_OFFLINE_TEXT = "You're offline. Skipping a day needs a connection.";

export const SKIP_CONFIRM_LABEL = 'Skip day';

export interface SkipDayEvent {
  kind: 'skip_day';
  position: Position;
}

export function skipLabel(definition: ProgramDefinition, position: Position): string {
  throw new Error(`skipLabel is not implemented: ${definition.key} ${JSON.stringify(position)}`);
}

export function skipDialogTitle(definition: ProgramDefinition, position: Position): string {
  throw new Error(`skipDialogTitle is not implemented: ${definition.key} ${JSON.stringify(position)}`);
}

export function skipDayEvent(position: Position): SkipDayEvent {
  throw new Error(`skipDayEvent is not implemented: ${JSON.stringify(position)}`);
}
