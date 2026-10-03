import { describe, expectTypeOf, it } from 'vitest';
import { type z } from 'zod';
import { type ProgramDefinition } from '@domain/index.ts';
import { parseProgramTemplate, type programDefinitionSchema } from '../../scripts/catalog/program-templates.ts';

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

type SchemaDefinition = z.infer<typeof programDefinitionSchema>;

describe('the program template schema type', () => {
  it('infers the domain ProgramDefinition field for field, ignoring only readonly modifiers', () => {
    expectTypeOf<DeepReadonly<SchemaDefinition>>().toEqualTypeOf<DeepReadonly<ProgramDefinition>>();
    expectTypeOf<DeepReadonly<ProgramDefinition>>().toEqualTypeOf<DeepReadonly<SchemaDefinition>>();
  });

  it('assigns a parsed definition to ProgramDefinition and back', () => {
    expectTypeOf<SchemaDefinition>().toExtend<ProgramDefinition>();
    expectTypeOf<ProgramDefinition>().toExtend<SchemaDefinition>();
  });

  it('returns a ProgramDefinition from parseProgramTemplate', () => {
    expectTypeOf(parseProgramTemplate).returns.toHaveProperty('definition').toEqualTypeOf<ProgramDefinition>();
  });
});
