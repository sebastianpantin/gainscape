import { z } from 'npm:zod@4.6.5';
import { authenticatedUserId } from '../_shared/auth.ts';
import { sql } from '../_shared/db.ts';
import { DEFAULT_BALANCE, isSessionEditable, type RevokedDrop } from '../_shared/domain/index.ts';
import { asHttpError } from '../_shared/http-errors.ts';
import { HttpError, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serve } from '../_shared/serve.ts';
import { lowerUuid, parseOr422 } from '../_shared/session-payload.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import { lockUser, requireOwnedSession, tombstoneOwner } from '../_shared/stores/sessions.ts';

const deleteSchema = z.object({ sessionId: lowerUuid }).strict();

interface DeleteResponse {
  sessionId: string;
  deleted: true;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

function parseDeleteSessionPayload(body: unknown): string {
  return parseOr422(deleteSchema, body).sessionId;
}

async function deleteSession(userId: string, sessionId: string): Promise<DeleteResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);
    if ((await tombstoneOwner(tx, sessionId)) === userId) {
      return { sessionId, deleted: true, replayedSessionIds: [], revokedDrops: [] };
    }

    const session = await requireOwnedSession(tx, userId, sessionId);
    if (!isSessionEditable({ historyOnly: session.historyOnly, startedAt: session.key.startedAt }, Date.now()))
      throw new HttpError(409, 'edit_window_closed');

    await takeRateLimit(tx, 'session_delete_hour', userId);
    const exerciseRows = await tx`select distinct exercise_id from public.sets where session_id = ${sessionId}`;
    await tx`
      insert into public.deleted_sessions (id, user_id, started_at)
      values (${sessionId}, ${userId}, ${session.key.startedAt})`;
    await tx`delete from public.sessions where id = ${sessionId} and user_id = ${userId}`;
    const { replayedSessionIds, revokedDrops } = await replayFrom(
      tx,
      userId,
      session.key,
      exerciseRows.map((row) => row.exercise_id),
      DEFAULT_BALANCE,
      [sessionId],
    );
    return { sessionId, deleted: true, replayedSessionIds, revokedDrops };
  });
}

serve(async (request) => {
  const userId = await authenticatedUserId(request);
  return jsonResponse(await deleteSession(userId, parseDeleteSessionPayload(await readJsonBody(request))));
}, asHttpError);
