import { z } from 'npm:zod@4.6.5';
import { HttpError } from '../_shared/http.ts';
import { assertDistinctSetIdsAndPositions, MAX_SETS_PER_SESSION, setSchema } from '../_shared/session-payload.ts';

const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;

function toMillisecondIsoString(instant: string): string {
  return new Date(instant).toISOString();
}

const sessionSchema = z.object({
  id: z.uuid().transform((id) => id.toLowerCase()),
  startedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  endedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  notes: z.string().max(2000).nullable().default(null),
  programDayId: z
    .uuid()
    .transform((id) => id.toLowerCase())
    .nullable()
    .default(null),
  sets: z.array(setSchema).min(1).max(MAX_SETS_PER_SESSION),
});

export type CompleteSessionPayload = z.infer<typeof sessionSchema>;

export function assertPlausibleTiming(payload: CompleteSessionPayload, now: Date): void {
  const started = Date.parse(payload.startedAt);
  const ended = Date.parse(payload.endedAt);
  const latestAllowed = now.getTime() + ALLOWED_CLOCK_SKEW_MS;
  if (ended < started) throw new HttpError(422, 'ends_before_start');
  if (ended - started > MAX_SESSION_DURATION_MS) throw new HttpError(422, 'session_too_long');
  if (started > latestAllowed || ended > latestAllowed) throw new HttpError(422, 'session_in_future');
}

export function parseCompleteSessionPayload(body: unknown): CompleteSessionPayload {
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, 'invalid_payload', z.treeifyError(parsed.error));
  assertDistinctSetIdsAndPositions(parsed.data.sets);
  return parsed.data;
}
