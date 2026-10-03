import { type ProgramDefinition, type ProgramEnrollment, type ProgramState, type ReferenceVar } from '@domain/index.ts';
import { liftName, REFERENCE_VAR_LABELS, referenceValueProblem, shownReference } from './program-enroll-rules.ts';

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
  return `${field.lift}.${field.var}`;
}

export function referenceFields(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: Pick<ProgramState, 'refs'>,
): ReferenceField[] {
  const lifts = [...new Set(definition.inputs.flatMap((input) => input.lifts))];
  return lifts.flatMap((lift) =>
    definition.referenceVars.flatMap((variable): ReferenceField[] => {
      const value = state.refs[lift]?.[variable];
      if (value === undefined) return [];
      return [
        {
          lift,
          var: variable,
          label: `${liftName(definition, lift)} ${REFERENCE_VAR_LABELS[variable]} (${enrollment.unit})`,
          value: shownReference(value),
        },
      ];
    }),
  );
}

export function referenceEvents(
  fields: readonly ReferenceField[],
  edited: Readonly<Record<string, string>>,
): ReferenceEventsResult {
  const problems: string[] = [];
  const events: SetReferenceEvent[] = [];
  for (const field of fields) {
    const raw = edited[referenceFieldKey(field)];
    if (raw === undefined) continue;
    const problem = referenceValueProblem(field.label, raw);
    if (problem) {
      problems.push(problem);
      continue;
    }
    const value = Number(raw.trim());
    if (value !== field.value) events.push({ kind: 'set_reference', lift: field.lift, var: field.var, value });
  }
  return problems.length > 0 ? { kind: 'invalid', problems } : { kind: 'ok', events };
}
