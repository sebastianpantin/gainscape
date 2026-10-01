import { sql } from '../_shared/db.ts';
import { DEFAULT_BALANCE } from '../_shared/domain/index.ts';
import { HttpError, jsonResponse } from '../_shared/http.ts';
import { serve } from '../_shared/serve.ts';
import { assertServiceRole } from '../_shared/service-auth.ts';
import { replayFrom } from '../_shared/stores/replay.ts';

async function rebuildUser(userId: string) {
  return await sql.begin(async (tx) => {
    const [profile] = await tx`select id from public.profiles where id = ${userId} for update`;
    if (!profile) throw new HttpError(404, 'user_not_found');

    await tx`delete from public.exercise_maxes where user_id = ${userId}`;
    await tx`delete from public.rep_maxes where user_id = ${userId}`;
    await tx`delete from public.bodyweight_rep_records where user_id = ${userId}`;
    await tx`delete from public.cardio_records where user_id = ${userId}`;
    const { sessionsReplayed, setsRewritten } = await replayFrom(tx, userId, null, [], DEFAULT_BALANCE);
    await tx`
      update public.sessions set derived_balance_version = ${DEFAULT_BALANCE.version}
      where user_id = ${userId} and not history_only and derived_balance_version <> ${DEFAULT_BALANCE.version}`;

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
