import { z } from 'npm:zod@4.6.5';
import { MAX_SETS_PER_SESSION, roundTo } from './domain/index.ts';
import { HttpError } from './http.ts';

export { MAX_SETS_PER_SESSION };

export const effortSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('level'), level: z.enum(['easy', 'hard', 'near_failure', 'failure']) }).strict(),
    z.object({ type: z.literal('rir'), value: z.number().min(0).max(10).multipleOf(0.5) }).strict(),
    z.object({ type: z.literal('rpe'), value: z.number().min(5).max(10).multipleOf(0.5) }).strict(),
  ])
  .nullable();

export const setSchema = z
  .object({
    id: z.uuid().transform((id) => id.toLowerCase()),
    exerciseId: z.uuid().transform((id) => id.toLowerCase()),
    position: z.int().min(0).max(999),
    weightKg: z
      .number()
      .min(0)
      .max(2000)
      .transform((weightKg) => roundTo(2, weightKg)),
    reps: z.int().min(1).max(100),
    isWarmup: z.boolean().default(false),
    effort: effortSchema.default(null),
  })
  .strict();

export type SetPayload = z.infer<typeof setSchema>;

export function hasDuplicates(values: readonly (string | number)[]): boolean {
  return new Set(values).size !== values.length;
}

export function assertDistinctSetIdsAndPositions(sets: readonly SetPayload[]): void {
  if (hasDuplicates(sets.map((set) => set.id))) throw new HttpError(422, 'duplicate_set_id');
  if (hasDuplicates(sets.map((set) => set.position))) throw new HttpError(422, 'duplicate_set_position');
}
