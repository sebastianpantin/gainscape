import { DEFAULT_ROUNDING, type ProgramDefinition, type ProgramEnrollment, type ReferenceVar } from '@domain/index.ts';

const CATALOG_INPUT_KG = 100;

export function catalogEnrollment(definition: ProgramDefinition): ProgramEnrollment {
  const inputs: Record<string, Partial<Record<ReferenceVar, number>>> = {};
  for (const input of definition.inputs) {
    for (const lift of input.lifts) inputs[lift] = { [input.kinds[0]]: CATALOG_INPUT_KG };
  }
  return {
    id: `enrollment-${definition.key}-${definition.version}`,
    unit: 'kg',
    options: {},
    bindings: Object.fromEntries(definition.lifts.map((lift) => [lift.key, lift.key])),
    inputs,
    rounding: DEFAULT_ROUNDING.kg,
  };
}
