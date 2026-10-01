import { z } from 'npm:zod@4.6.5';
import { MAX_SETS_PER_SESSION } from '../_shared/domain/index.ts';
import { assertDistinctSetIdsAndPositions, lowerUuid, parseOr422, setSchema } from '../_shared/session-payload.ts';

const editSchema = z
  .object({
    sessionId: lowerUuid,
    ifRevision: z.int().min(0),
    notes: z.string().max(2000).nullable(),
    sets: z.array(setSchema).min(1).max(MAX_SETS_PER_SESSION),
  })
  .strict();

export type EditSessionPayload = z.infer<typeof editSchema>;

export function parseEditSessionPayload(body: unknown): EditSessionPayload {
  const payload = parseOr422(editSchema, body);
  assertDistinctSetIdsAndPositions(payload.sets);
  return payload;
}
