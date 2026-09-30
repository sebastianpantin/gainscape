import { type JsonValue, sql, type Transaction } from '../_shared/db.ts';
import {
  type Catalog,
  type CurrentStrength,
  DEFAULT_BALANCE,
  NO_RECORDS,
  type ReplayResult,
  replayHistory,
  strengthAfterSession,
} from '../_shared/domain/index.ts';
import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts';
import { assertServiceRole } from '../_shared/service-auth.ts';
import { loadCatalog } from '../_shared/stores/catalog.ts';
import { derivedSetColumns, setSkillXpRows } from '../_shared/stores/set-columns.ts';
import { replaceAllRecords } from '../_shared/stores/records.ts';
import { saveCurrentStrength } from '../_shared/stores/strength.ts';
import { loadReplayableSessions } from './history-store.ts';

function latestStrengthPerExercise(replay: ReplayResult): Record<string, CurrentStrength> {
  const latest: Record<string, CurrentStrength> = {};
  for (const entry of replay.sessions)
    Object.assign(latest, strengthAfterSession(entry.strengthAtStart, entry.outputs.sets));
  return latest;
}

async function rewriteDerivedSetColumns(tx: Transaction, replay: ReplayResult): Promise<number> {
  const results = replay.sessions.flatMap((entry) => entry.outputs.sets);
  if (results.length === 0) return 0;
  const derivedRows = results.map((result) => ({ id: result.set.id, ...derivedSetColumns(result) }));
  await tx`
    update public.sets as target
    set rir = derived.rir,
        rir_source = derived.rir_source,
        rir_flagged = derived.rir_flagged,
        e1rm_before_kg = derived.e1rm_before_kg,
        e1rm_candidate_kg = derived.e1rm_candidate_kg,
        reps_capacity_candidate = derived.reps_capacity_candidate,
        effective_reps = derived.effective_reps,
        xp_awarded = derived.xp_awarded,
        updated_at = now()
    from jsonb_to_recordset(${tx.json(derivedRows as unknown as JsonValue)}) as derived (
      id uuid,
      rir numeric,
      rir_source public.rir_source,
      rir_flagged boolean,
      e1rm_before_kg numeric,
      e1rm_candidate_kg numeric,
      reps_capacity_candidate int,
      effective_reps int,
      xp_awarded int
    )
    where target.id = derived.id`;
  return results.length;
}

async function rewriteXp(tx: Transaction, userId: string, replay: ReplayResult): Promise<void> {
  await tx`delete from public.set_skill_xp where user_id = ${userId}`;
  const xpRows = setSkillXpRows(
    replay.sessions.flatMap((entry) => entry.outputs.sets),
    userId,
  );
  if (xpRows.length > 0) await tx`insert into public.set_skill_xp ${tx(xpRows)}`;

  await tx`delete from public.user_skills where user_id = ${userId}`;
  const skillRows = Object.entries(replay.finalState.skillXp).map(([skillId, xp]) => ({
    user_id: userId,
    skill_id: skillId,
    xp,
  }));
  if (skillRows.length > 0) await tx`insert into public.user_skills ${tx(skillRows)}`;
}

async function rewriteStrength(tx: Transaction, userId: string, replay: ReplayResult, catalog: Catalog): Promise<void> {
  await tx`delete from public.exercise_maxes where user_id = ${userId}`;
  await saveCurrentStrength(
    tx,
    userId,
    latestStrengthPerExercise(replay),
    (exerciseId) => catalog.exercises.get(exerciseId)?.loadType === 'bodyweight',
  );
}

async function rebuildUser(userId: string) {
  return await sql.begin(async (tx) => {
    const [profile] = await tx`select id from public.profiles where id = ${userId} for update`;
    if (!profile) throw new HttpError(404, 'user_not_found');

    const sessions = await loadReplayableSessions(tx, userId, DEFAULT_BALANCE);
    const exerciseIds = [...new Set(sessions.flatMap((session) => session.sets.map((set) => set.exerciseId)))];
    const catalog = await loadCatalog(tx, userId, exerciseIds, true);
    const replay = replayHistory(sessions, catalog, DEFAULT_BALANCE);

    const setsRewritten = await rewriteDerivedSetColumns(tx, replay);
    await rewriteXp(tx, userId, replay);
    await rewriteStrength(tx, userId, replay, catalog);
    await replaceAllRecords(tx, userId, replay.finalState.records ?? NO_RECORDS);
    await tx`update public.sessions set derived_balance_version = ${DEFAULT_BALANCE.version} where user_id = ${userId} and not history_only`;

    return { userId, sessionsReplayed: sessions.length, setsRewritten, balanceVersion: DEFAULT_BALANCE.version };
  });
}

async function requestedUserId(request: Request): Promise<string> {
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId.toLowerCase() : null;
  if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) throw new HttpError(422, 'user_id_required');
  return userId;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    await assertServiceRole(request);
    return jsonResponse(await rebuildUser(await requestedUserId(request)));
  } catch (error) {
    return errorResponse(error);
  }
});
