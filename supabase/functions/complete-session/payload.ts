import { z } from 'npm:zod@4.6.5';
import { implausibleTiming, MAX_SETS_PER_SESSION } from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { assertDistinctSetIdsAndPositions, lowerUuid, parseOr422, setSchema } from '../_shared/session-payload.ts';

function toMillisecondIsoString(instant: string): string {
  return new Date(instant).toISOString();
}

const sessionSchema = z.object({
  id: lowerUuid,
  startedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  endedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  notes: z.string().max(2000).nullable().default(null),
  programDayId: lowerUuid.nullable().default(null),
  sets: z.array(setSchema).min(1).max(MAX_SETS_PER_SESSION),
});

export type CompleteSessionPayload = z.infer<typeof sessionSchema>;

export function assertPlausibleTiming(payload: CompleteSessionPayload, now: Date): void {
  const reason = implausibleTiming(payload.startedAt, payload.endedAt, now.getTime());
  if (reason !== null) throw new HttpError(422, reason);
}

export function parseCompleteSessionPayload(body: unknown): CompleteSessionPayload {
  const payload = parseOr422(sessionSchema, body);
  assertDistinctSetIdsAndPositions(payload.sets);
  return payload;
}
