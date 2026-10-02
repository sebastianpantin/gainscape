import {
  type InputKind,
  type OptionValue,
  type ProgramDefinition,
  type RoundingSetting,
  type WeightUnit,
} from '@domain/index.ts';

export const UPDATE_APP_TEXT = 'Update the app to use this program';

export const UNUSABLE_TEMPLATE_TEXT = "This program can't be used right now";

export interface ProgramTemplateRow {
  key: string;
  version: number;
  name: string;
  definition: unknown;
}

export type TemplateListEntry =
  | { kind: 'enrollable'; key: string; version: number; name: string; definition: ProgramDefinition }
  | { kind: 'needs_update'; key: string; version: number; name: string; message: typeof UPDATE_APP_TEXT }
  | { kind: 'unusable'; key: string; version: number; name: string; message: typeof UNUSABLE_TEMPLATE_TEXT };

export interface BindableExercise {
  id: string;
  key: string | null;
  name: string;
  archived: boolean;
}

export interface EnrollForm {
  unit: WeightUnit;
  inputKinds: Readonly<Record<string, InputKind>>;
  inputValues: Readonly<Record<string, string>>;
  options: Readonly<Record<string, OptionValue>>;
  bindings: Readonly<Record<string, string | null>>;
  rounding: RoundingSetting;
}

export interface InputField {
  lift: string;
  kind: InputKind;
  kinds: readonly InputKind[];
  label: string;
  unit: WeightUnit;
}

export interface OptionChoice {
  value: OptionValue;
  label: string;
}

export type OptionControl =
  | { kind: 'choice'; key: string; label: string; choices: OptionChoice[]; defaultValue: OptionValue }
  | { kind: 'number'; key: string; label: string; min: number; max: number; defaultValue: number };

export interface EnrollProgramPayload {
  templateKey: string;
  templateVersion: number;
  unit: WeightUnit;
  options: Record<string, OptionValue>;
  bindings: Record<string, string | null>;
  inputs: Record<string, Partial<Record<InputKind, number>>>;
  rounding: RoundingSetting;
}

export type EnrollPayloadResult =
  { kind: 'ok'; payload: EnrollProgramPayload } | { kind: 'invalid'; problems: string[] };

export function templateListEntries(rows: readonly ProgramTemplateRow[]): TemplateListEntry[] {
  void rows;
  throw new Error('not implemented');
}

export function defaultBindings(
  definition: ProgramDefinition,
  exercises: readonly BindableExercise[],
): Record<string, string | null> {
  void definition;
  void exercises;
  throw new Error('not implemented');
}

export function initialEnrollForm(
  definition: ProgramDefinition,
  unit: WeightUnit,
  exercises: readonly BindableExercise[],
): EnrollForm {
  void definition;
  void unit;
  void exercises;
  throw new Error('not implemented');
}

export function withUnit(form: EnrollForm, unit: WeightUnit): EnrollForm {
  void form;
  void unit;
  throw new Error('not implemented');
}

export function inputFields(definition: ProgramDefinition, form: EnrollForm): InputField[] {
  void definition;
  void form;
  throw new Error('not implemented');
}

export function optionControls(definition: ProgramDefinition): OptionControl[] {
  void definition;
  throw new Error('not implemented');
}

export function referencePreview(definition: ProgramDefinition, form: EnrollForm, lift: string): string | null {
  void definition;
  void form;
  void lift;
  throw new Error('not implemented');
}

export function enrollPayload(definition: ProgramDefinition, form: EnrollForm): EnrollPayloadResult {
  void definition;
  void form;
  throw new Error('not implemented');
}
