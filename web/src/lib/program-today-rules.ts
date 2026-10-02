import {
  type Position,
  type PrescriptionSnapshot,
  type ProgramDefinition,
  type ResolvedSlot,
  type ScheduleCursor,
  type WeightUnit,
} from '@domain/index.ts';

export interface DayChoice {
  position: Position;
  label: string;
  suggested: boolean;
}

export interface PrescriptionRow {
  ref: string;
  setNumber: number;
  weight: number | null;
  unit: WeightUnit;
  repsLabel: string;
  amrapBadge: string | null;
  pctLabel: string | null;
  optional: boolean;
  line: string;
}

export type PrescriptionCard =
  | { kind: 'exercise'; slotId: string; title: string; exerciseName: string; rows: PrescriptionRow[] }
  | { kind: 'unsupported'; slotId: string; title: string; message: string };

export function positionLabel(definition: ProgramDefinition, position: Position): string {
  void definition;
  void position;
  throw new Error('not implemented');
}

export function startLabel(templateName: string, definition: ProgramDefinition, position: Position): string {
  void templateName;
  void definition;
  void position;
  throw new Error('not implemented');
}

export function dayChoices(definition: ProgramDefinition, cursor: ScheduleCursor): DayChoice[] {
  void definition;
  void cursor;
  throw new Error('not implemented');
}

export function pickedDay(choices: readonly DayChoice[], picked: Position | null): Position {
  void choices;
  void picked;
  throw new Error('not implemented');
}

export function prescriptionCards(
  definition: ProgramDefinition,
  slots: readonly ResolvedSlot[],
  unit: WeightUnit,
  exerciseNames: ReadonlyMap<string, string>,
): PrescriptionCard[] {
  void definition;
  void slots;
  void unit;
  void exerciseNames;
  throw new Error('not implemented');
}

export function amrapBadgeOf(prescription: PrescriptionSnapshot | null | undefined): string | null {
  void prescription;
  throw new Error('not implemented');
}
