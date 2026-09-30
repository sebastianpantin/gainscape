import { z } from 'npm:zod@4.6.5';
import { HttpError } from '../_shared/http.ts';
import { assertDistinctSetIdsAndPositions, MAX_SETS_PER_SESSION, setSchema } from '../_shared/session-payload.ts';

const editSchema = z
  .object({
    sessionId: z.uuid().transform((id) => id.toLowerCase()),
    ifRevision: z.int().min(0),
    notes: z.string().max(2000).nullable(),
    sets: z.array(setSchema).min(1).max(MAX_SETS_PER_SESSION),
  })
  .strict();

export type EditSessionPayload = z.infer<typeof editSchema>;

export function parseEditSessionPayload(body: unknown): EditSessionPayload {
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, 'invalid_payload', z.treeifyError(parsed.error));
  assertDistinctSetIdsAndPositions(parsed.data.sets);
  return parsed.data;
}
