import { z } from 'npm:zod@4.6.5';
import { sql } from '../_shared/db.ts';
import { DEFAULT_BALANCE } from '../_shared/domain/index.ts';
import { HttpError, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { serve } from '../_shared/serve.ts';
import { assertSecretKey } from '../_shared/service-auth.ts';
import { lowerUuid, parseOr422 } from '../_shared/session-payload.ts';
import { listUsersToRebuild } from '../_shared/stores/rebuild.ts';
import { clearRecordCaches } from '../_shared/stores/records.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import { lockUser, markSessionsDerivedAt } from '../_shared/stores/sessions.ts';
import { clearStrengthCache } from '../_shared/stores/strength.ts';

const MAX_USERS_PER_BATCH = 50;
const MAX_USERS_PER_PAGE = 1000;

const rebuildSchema = z.union([
  z.object({ userId: lowerUuid }).strict(),
  z
    .object({
      userIds: z
        .array(lowerUuid)
        .min(1)
        .max(MAX_USERS_PER_BATCH)
        .refine((ids) => new Set(ids).size === ids.length, 'user ids must be unique'),
    })
    .strict(),
  z
    .object({
      list: z
        .object({
          scope: z.enum(['stale', 'all']),
          after: lowerUuid.nullable(),
          limit: z.int().min(1).max(MAX_USERS_PER_PAGE),
        })
        .strict(),
    })
    .strict(),
]);

async function rebuildUser(userId: string) {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId, new HttpError(404, 'user_not_found'));

    await clearStrengthCache(tx, userId);
    await clearRecordCaches(tx, userId);
    const { sessionsReplayed, setsRewritten } = await replayFrom(tx, userId, null, [], DEFAULT_BALANCE);
    await markSessionsDerivedAt(tx, userId, DEFAULT_BALANCE.version);

    return { userId, sessionsReplayed, setsRewritten };
  });
}

function isMissingUser(error: unknown): boolean {
  return error instanceof HttpError && error.code === 'user_not_found';
}

async function rebuildBatch(userIds: readonly string[]) {
  const rebuilt = [];
  const missing = [];
  for (const userId of userIds) {
    try {
      rebuilt.push(await rebuildUser(userId));
    } catch (error) {
      if (!isMissingUser(error)) {
        console.error(error);
        throw new HttpError(500, 'rebuild_failed', { userId, rebuiltBefore: rebuilt.length });
      }
      missing.push(userId);
    }
  }
  return { balanceVersion: DEFAULT_BALANCE.version, rebuilt, missing };
}

serve(async (request) => {
  await assertSecretKey(request);
  const body = parseOr422(rebuildSchema, await readJsonBody(request));
  if ('userId' in body) {
    return jsonResponse({ ...(await rebuildUser(body.userId)), balanceVersion: DEFAULT_BALANCE.version });
  }
  if ('userIds' in body) return jsonResponse(await rebuildBatch(body.userIds));
  const { scope, after, limit } = body.list;
  return jsonResponse(await sql.begin((tx) => listUsersToRebuild(tx, scope, after, limit, DEFAULT_BALANCE.version)));
});
