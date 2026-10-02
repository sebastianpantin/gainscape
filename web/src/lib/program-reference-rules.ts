import { type ProgramDefinition, type ProgramEnrollment, type ProgramState, type ReferenceVar } from '@domain/index.ts';

export interface ReferenceField {
  lift: string;
  var: ReferenceVar;
  label: string;
  value: number;
}

export interface SetReferenceEvent {
  kind: 'set_reference';
  lift: string;
  var: ReferenceVar;
  value: number;
}

export type ReferenceEventsResult =
  { kind: 'ok'; events: SetReferenceEvent[] } | { kind: 'invalid'; problems: string[] };

export function referenceFieldKey(field: Pick<ReferenceField, 'lift' | 'var'>): string {
  void field;
  throw new Error('not implemented');
}

export function referenceFields(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: Pick<ProgramState, 'refs'>,
): ReferenceField[] {
  void definition;
  void enrollment;
  void state;
  throw new Error('not implemented');
}

export function referenceEvents(
  fields: readonly ReferenceField[],
  edited: Readonly<Record<string, string>>,
): ReferenceEventsResult {
  void fields;
  void edited;
  throw new Error('not implemented');
}
