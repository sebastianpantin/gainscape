import { z } from 'npm:zod@4.6.5';
import { sql } from '../_shared/db.ts';
import { DEFAULT_BALANCE, type RevokedDrop } from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { lowerUuid, parseOr422 } from '../_shared/session-payload.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import {
  isOwnedSessionEditable,
  lockUser,
  requireOwnedSession,
  sessionExerciseIds,
  tombstoneOwner,
  tombstoneSession,
} from '../_shared/stores/sessions.ts';

const deleteSchema = z.object({ sessionId: lowerUuid, ifRevision: z.int().min(0).optional() }).strict();

type DeleteSessionPayload = z.infer<typeof deleteSchema>;

interface DeleteResponse {
  sessionId: string;
  deleted: true;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

function parseDeleteSessionPayload(body: unknown): DeleteSessionPayload {
  return parseOr422(deleteSchema, body);
}

async function deleteSession(userId: string, { sessionId, ifRevision }: DeleteSessionPayload): Promise<DeleteResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);
    if ((await tombstoneOwner(tx, sessionId)) === userId) {
      return { sessionId, deleted: true, replayedSessionIds: [], revokedDrops: [] };
    }

    const session = await requireOwnedSession(tx, userId, sessionId);
    if (!isOwnedSessionEditable(session, Date.now())) throw new HttpError(409, 'edit_window_closed');
    if (ifRevision !== undefined && ifRevision !== session.revision) {
      throw new HttpError(409, 'revision_conflict', { revision: session.revision });
    }

    await takeRateLimit(tx, 'session_delete_hour', userId);
    const exerciseIds = await sessionExerciseIds(tx, sessionId);
    await tombstoneSession(tx, userId, session.key);
    const { replayedSessionIds, revokedDrops } = await replayFrom(
      tx,
      userId,
      session.key,
      exerciseIds,
      DEFAULT_BALANCE,
      [sessionId],
    );
    return { sessionId, deleted: true, replayedSessionIds, revokedDrops };
  });
}

serveAuthenticated(parseDeleteSessionPayload, deleteSession);
