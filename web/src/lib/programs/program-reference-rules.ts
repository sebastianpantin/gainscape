import {
  isRetestPending,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramState,
  type ReferenceVar,
  retestVarOf,
  type WeightUnit,
} from '@domain/index.ts';
import { liftName, REFERENCE_VAR_LABELS, referenceValueProblem, shownReference } from './program-enroll-rules.ts';

export interface ReferenceField {
  lift: string;
  var: ReferenceVar;
  label: string;
  unit: WeightUnit;
  value: number | null;
}

export interface SetReferenceEvent {
  kind: 'set_reference';
  lift: string;
  var: ReferenceVar;
  value: number;
}

type ReferenceEventsResult = { kind: 'ok'; events: SetReferenceEvent[] } | { kind: 'invalid'; problems: string[] };

export function referenceFieldKey(field: Pick<ReferenceField, 'lift' | 'var'>): string {
  return `${field.lift}.${field.var}`;
}

export function referenceFields(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: Pick<ProgramState, 'refs' | 'pendingRetests'>,
): ReferenceField[] {
  const lifts = [...new Set(definition.inputs.flatMap((input) => input.lifts))];
  return lifts.flatMap((lift) => {
    const retestVar = retestVarOf(definition, lift);
    return definition.referenceVars.flatMap((variable): ReferenceField[] => {
      const value = state.refs[lift]?.[variable];
      const pending = isRetestPending(state, lift, variable);
      if (!pending && (variable === retestVar || value === undefined)) return [];
      return [
        {
          lift,
          var: variable,
          label: `${liftName(definition, lift)} ${REFERENCE_VAR_LABELS[variable]} (${enrollment.unit})`,
          unit: enrollment.unit,
          value: pending || value === undefined ? null : shownReference(value),
        },
      ];
    });
  });
}

export function referenceEvents(
  fields: readonly ReferenceField[],
  edited: Readonly<Record<string, string>>,
): ReferenceEventsResult {
  const problems: string[] = [];
  const events: SetReferenceEvent[] = [];
  for (const field of fields) {
    const raw = edited[referenceFieldKey(field)];
    if (raw === undefined || (field.value === null && raw.trim() === '')) continue;
    const problem = referenceValueProblem(field.label, raw, field.unit);
    if (problem) {
      problems.push(problem);
      continue;
    }
    const value = Number(raw.trim());
    if (value !== field.value) events.push({ kind: 'set_reference', lift: field.lift, var: field.var, value });
  }
  return problems.length > 0 ? { kind: 'invalid', problems } : { kind: 'ok', events };
}
