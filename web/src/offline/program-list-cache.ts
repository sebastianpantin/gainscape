import { z } from 'zod';
import { PROGRAM_CATEGORIES } from '../lib/programs/program-row-rules.ts';
import { type Program, type ProgramDoc } from '../lib/programs/programs.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_PROGRAMS_NOTICE = 'Offline: using your saved programs.';

const progressionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('fixed') }),
  z.object({ kind: z.literal('linear'), incrementKg: z.number(), incrementLb: z.number() }),
]);

const programSchema = z.object({
  id: z.string(),
  key: z.string().nullable(),
  name: z.string(),
  category: z.enum(PROGRAM_CATEGORIES).nullable().optional(),
  ownerUserId: z.string().nullable(),
  copiedFromId: z.string().nullable(),
  days: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      position: z.number(),
      exercises: z.array(
        z.object({
          exerciseId: z.string(),
          targetSets: z.number(),
          targetRepsMin: z.number(),
          targetRepsMax: z.number(),
          targetDurationS: z.number().nullable().optional(),
          progression: progressionSchema.default({ kind: 'none' }),
        }),
      ),
    }),
  ),
});

export const programListCache = userCache<Program[]>('gainscape.programs.v1.', z.array(programSchema));

export function withSavedProgramDoc(programs: Program[], doc: ProgramDoc): Program[] {
  return programs.map((program) =>
    program.id === doc.id
      ? { ...program, name: doc.name, days: doc.days.map((day, position) => ({ ...day, position })) }
      : program,
  );
}
