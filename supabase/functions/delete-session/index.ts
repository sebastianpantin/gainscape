import { z } from 'npm:zod@4.6.5';
import { sql } from '../_shared/db.ts';
import { type RevokedDrop } from '../_shared/domain/index.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { lowerUuid, parseOr422 } from '../_shared/session-payload.ts';
import { deleteSessionAndRederive } from '../_shared/stores/replay.ts';
import { assertEditableAt, lockUser, requireOwnedSession, tombstoneOwner } from '../_shared/stores/sessions.ts';

const deleteSchema = z.object({ sessionId: lowerUuid, ifRevision: z.int().min(0).optional() }).strict();

type DeleteSessionPayload = z.infer<typeof deleteSchema>;

interface DeleteResponse {
  sessionId: string;
  deleted: true;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

async function deleteSession(userId: string, { sessionId, ifRevision }: DeleteSessionPayload): Promise<DeleteResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);
    if ((await tombstoneOwner(tx, sessionId)) === userId) {
      return { sessionId, deleted: true, replayedSessionIds: [], revokedDrops: [] };
    }

    const session = await requireOwnedSession(tx, userId, sessionId);
    assertEditableAt(session, ifRevision, Date.now());

    await takeRateLimit(tx, 'session_delete_hour', userId);
    const { replayedSessionIds, revokedDrops } = await deleteSessionAndRederive(tx, userId, session.key);
    return { sessionId, deleted: true, replayedSessionIds, revokedDrops };
  });
}

serveAuthenticated((body) => parseOr422(deleteSchema, body), deleteSession);
