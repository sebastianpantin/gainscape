import { z } from 'npm:zod@4.6.5';
import { CARDIO_BOUNDS, intervalDurationSeconds, roundTo } from './domain/index.ts';
import { HttpError } from './http.ts';

export const lowerUuid = z.uuid().transform((id) => id.toLowerCase());

export function parseOr422<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, 'invalid_payload', z.treeifyError(parsed.error));
  return parsed.data;
}

const liftEffortSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('level'), level: z.enum(['easy', 'hard', 'near_failure', 'failure']) }).strict(),
    z.object({ type: z.literal('rir'), value: z.number().min(0).max(10).multipleOf(0.5) }).strict(),
    z.object({ type: z.literal('rpe'), value: z.number().min(5).max(10).multipleOf(0.5) }).strict(),
  ])
  .nullable();

const cardioEffortSchema = z
  .object({ type: z.literal('cardio'), level: z.enum(['easy', 'moderate', 'hard', 'max']) })
  .strict()
  .nullable();

const setIdentity = {
  id: lowerUuid,
  exerciseId: lowerUuid,
  position: z.int().min(0).max(999),
};

const within = (bounds: { min: number; max: number }) => z.int().min(bounds.min).max(bounds.max);

const liftSetSchema = z
  .object({
    kind: z.literal('lift'),
    ...setIdentity,
    weightKg: z
      .number()
      .min(0)
      .max(2000)
      .transform((weightKg) => roundTo(2, weightKg)),
    reps: z.int().min(1).max(100),
    isWarmup: z.boolean().default(false),
    effort: liftEffortSchema.default(null),
  })
  .strict();

const intervalSchema = z
  .object({
    workS: within(CARDIO_BOUNDS.intervalWorkS),
    restS: within(CARDIO_BOUNDS.intervalRestS),
    rounds: within(CARDIO_BOUNDS.intervalRounds),
  })
  .strict()
  .refine((interval) => {
    const durationS = intervalDurationSeconds(interval);
    return durationS >= CARDIO_BOUNDS.intervalDurationS.min && durationS <= CARDIO_BOUNDS.intervalDurationS.max;
  }, 'interval duration out of bounds');

const cardioSetSchema = z
  .object({
    kind: z.literal('cardio'),
    ...setIdentity,
    durationS: within(CARDIO_BOUNDS.steadyDurationS).optional(),
    distanceM: z
      .number()
      .min(CARDIO_BOUNDS.distanceM.min)
      .max(CARDIO_BOUNDS.distanceM.max)
      .transform((distanceM) => roundTo(1, distanceM))
      .nullable()
      .default(null),
    interval: intervalSchema.nullable().default(null),
    effort: cardioEffortSchema.default(null),
  })
  .strict()
  .refine((bout) => (bout.interval === null) === (bout.durationS !== undefined), {
    message: 'a steady bout needs durationS and an interval bout must not send it',
    path: ['durationS'],
  });

function addLiftKindWhenMissing(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || 'kind' in value) return value;
  return { ...value, kind: 'lift' };
}

export const setSchema = z
  .preprocess(addLiftKindWhenMissing, z.discriminatedUnion('kind', [liftSetSchema, cardioSetSchema]))
  .transform((set) => {
    if (set.kind === 'lift') return set;
    return { ...set, durationS: set.interval === null ? set.durationS! : intervalDurationSeconds(set.interval) };
  });

export type SetPayload = z.infer<typeof setSchema>;

function hasDuplicates(values: readonly (string | number)[]): boolean {
  return new Set(values).size !== values.length;
}

export function assertDistinctSetIdsAndPositions(sets: readonly SetPayload[]): void {
  if (hasDuplicates(sets.map((set) => set.id))) throw new HttpError(422, 'duplicate_set_id');
  if (hasDuplicates(sets.map((set) => set.position))) throw new HttpError(422, 'duplicate_set_position');
}
