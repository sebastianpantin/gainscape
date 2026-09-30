import { z } from 'npm:zod@4.6.5';
import { HttpError } from '../_shared/http.ts';

const MAX_SETS_PER_SESSION = 200;
const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function toMillisecondIsoString(instant: string): string {
  return new Date(instant).toISOString();
}

const effortSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('level'), level: z.enum(['easy', 'hard', 'near_failure', 'failure']) }),
    z.object({ type: z.literal('rir'), value: z.number().min(0).max(10).multipleOf(0.5) }),
    z.object({ type: z.literal('rpe'), value: z.number().min(5).max(10).multipleOf(0.5) }),
  ])
  .nullable();

const setSchema = z.object({
  id: z.uuid().transform((id) => id.toLowerCase()),
  exerciseId: z.uuid().transform((id) => id.toLowerCase()),
  position: z.int().min(0).max(999),
  weightKg: z.number().min(0).max(2000),
  reps: z.int().min(1).max(100),
  isWarmup: z.boolean().default(false),
  effort: effortSchema.default(null),
});

const sessionSchema = z.object({
  id: z.uuid().transform((id) => id.toLowerCase()),
  startedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  endedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  notes: z.string().max(2000).nullable().default(null),
  sets: z.array(setSchema).min(1).max(MAX_SETS_PER_SESSION),
});

export type CompleteSessionPayload = z.infer<typeof sessionSchema>;

function hasDuplicates(values: readonly (string | number)[]): boolean {
  return new Set(values).size !== values.length;
}

export function assertPlausibleTiming(payload: CompleteSessionPayload, now: Date): void {
  const started = Date.parse(payload.startedAt);
  const ended = Date.parse(payload.endedAt);
  const latestAllowed = now.getTime() + ALLOWED_CLOCK_SKEW_MS;
  if (ended < started) throw new HttpError(422, 'ends_before_start');
  if (ended - started > MAX_SESSION_DURATION_MS) throw new HttpError(422, 'session_too_long');
  if (started > latestAllowed || ended > latestAllowed) throw new HttpError(422, 'session_in_future');
  if (started < now.getTime() - MAX_SESSION_AGE_MS) throw new HttpError(422, 'session_too_old');
}

export function parseCompleteSessionPayload(body: unknown): CompleteSessionPayload {
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, 'invalid_payload', z.treeifyError(parsed.error));
  const payload = parsed.data;
  if (hasDuplicates(payload.sets.map((set) => set.id))) throw new HttpError(422, 'duplicate_set_id');
  if (hasDuplicates(payload.sets.map((set) => set.position))) throw new HttpError(422, 'duplicate_set_position');
  return payload;
}
