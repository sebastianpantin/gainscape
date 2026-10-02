import { z } from 'npm:zod@4.6.5';
import { sql } from '../_shared/db.ts';
import { DEFAULT_BALANCE } from '../_shared/domain/index.ts';
import { HttpError, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { serve } from '../_shared/serve.ts';
import { assertServiceRole } from '../_shared/service-auth.ts';
import { lowerUuid, parseOr422 } from '../_shared/session-payload.ts';
import { clearRecordCaches } from '../_shared/stores/records.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import { lockUser, markSessionsDerivedAt } from '../_shared/stores/sessions.ts';
import { clearStrengthCache } from '../_shared/stores/strength.ts';

const rebuildSchema = z.object({ userId: lowerUuid }).strict();

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

serve(async (request) => {
  await assertServiceRole(request);
  const { userId } = parseOr422(rebuildSchema, await readJsonBody(request));
  return jsonResponse(await rebuildUser(userId));
});
