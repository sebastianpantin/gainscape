import type { InputKind, ReferenceVar } from '@domain/index.ts';
import type { GlossaryKey } from './glossary.ts';
import type { InputField } from './program-enroll-rules.ts';
import type { ReferenceField } from './program-reference-rules.ts';

export const INPUT_KIND_GLOSSARY: Readonly<Record<InputKind, GlossaryKey | null>> = {
  oneRm: 'oneRm',
  tm: 'trainingMax',
  fiveRm: 'fiveRm',
  e1rm: 'e1rm',
  workingWeight: null,
};

export const REFERENCE_VAR_GLOSSARY: Readonly<Record<ReferenceVar, GlossaryKey | null>> = {
  tm: 'trainingMax',
  top: null,
  fiveRm: 'fiveRm',
  e1rm: 'e1rm',
  workingWeight: null,
};

function explainedKeys(keys: readonly (GlossaryKey | null)[]): GlossaryKey[] {
  return [...new Set(keys.filter((key) => key !== null))];
}

export function inputHelpKeys(fields: readonly Pick<InputField, 'kinds'>[]): GlossaryKey[] {
  return explainedKeys(fields.flatMap((field) => field.kinds.map((kind) => INPUT_KIND_GLOSSARY[kind])));
}

export function referenceHelpKeys(fields: readonly Pick<ReferenceField, 'var'>[]): GlossaryKey[] {
  return explainedKeys(fields.map((field) => REFERENCE_VAR_GLOSSARY[field.var]));
}
