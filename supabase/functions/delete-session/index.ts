import { z } from 'npm:zod@4.6.5';
import { authenticatedUserId } from '../_shared/auth.ts';
import { sql } from '../_shared/db.ts';
import { DEFAULT_BALANCE, isWithinEditWindow, type RevokedDrop } from '../_shared/domain/index.ts';
import { asHttpError } from '../_shared/http-errors.ts';
import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import { loadOwnedSession, lockUser, tombstoneOwner } from '../_shared/stores/sessions.ts';

const deleteSchema = z.object({ sessionId: z.uuid().transform((id) => id.toLowerCase()) }).strict();

interface DeleteResponse {
  sessionId: string;
  deleted: true;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

function parseDeleteSessionPayload(body: unknown): string {
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, 'invalid_payload', z.treeifyError(parsed.error));
  return parsed.data.sessionId;
}

async function deleteSession(userId: string, sessionId: string): Promise<DeleteResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);
    if ((await tombstoneOwner(tx, sessionId)) === userId) {
      return { sessionId, deleted: true, replayedSessionIds: [], revokedDrops: [] };
    }

    const session = await loadOwnedSession(tx, userId, sessionId);
    if (!session) throw new HttpError(404, 'session_not_found');
    if (session.historyOnly || !isWithinEditWindow(session.key.startedAt, Date.now())) {
      throw new HttpError(409, 'edit_window_closed');
    }

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const userId = await authenticatedUserId(request);
    const body = await request.json().catch(() => {
      throw new HttpError(400, 'invalid_json');
    });
    return jsonResponse(await deleteSession(userId, parseDeleteSessionPayload(body)));
  } catch (error) {
    return errorResponse(asHttpError(error));
  }
});
