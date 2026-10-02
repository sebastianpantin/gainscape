import { sql } from '../_shared/db.ts';
import { DEFAULT_BALANCE } from '../_shared/domain/index.ts';
import { HttpError, jsonResponse } from '../_shared/http.ts';
import { serve } from '../_shared/serve.ts';
import { assertServiceRole } from '../_shared/service-auth.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import { clearRecordCaches } from '../_shared/stores/records.ts';
import { lockUser, markSessionsDerivedAt } from '../_shared/stores/sessions.ts';
import { clearStrengthCache } from '../_shared/stores/strength.ts';

async function rebuildUser(userId: string) {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId, new HttpError(404, 'user_not_found'));

    await clearStrengthCache(tx, userId);
    await clearRecordCaches(tx, userId);
    const { sessionsReplayed, setsRewritten } = await replayFrom(tx, userId, null, [], DEFAULT_BALANCE);
    await markSessionsDerivedAt(tx, userId, DEFAULT_BALANCE.version);

    return { userId, sessionsReplayed, setsRewritten, balanceVersion: DEFAULT_BALANCE.version };
  });
}

async function requestedUserId(request: Request): Promise<string> {
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId.toLowerCase() : null;
  if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) throw new HttpError(422, 'user_id_required');
  return userId;
}

serve(async (request) => {
  await assertServiceRole(request);
  return jsonResponse(await rebuildUser(await requestedUserId(request)));
});
