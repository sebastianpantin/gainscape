import { authenticatedUserId } from '../_shared/auth.ts';
import { type JsonValue, sql, type Transaction } from '../_shared/db.ts';
import {
  carriedEffectiveLoadKg,
  type Catalog,
  DEFAULT_BALANCE,
  type DropSummary,
  effectiveLoadForNewSet,
  isWithinEditWindow,
  resolveEffort,
  type SessionSummary,
} from '../_shared/domain/index.ts';
import { asHttpError } from '../_shared/http-errors.ts';
import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts';
import type { SetPayload } from '../_shared/session-payload.ts';
import { loadCatalog } from '../_shared/stores/catalog.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import {
  assertSetIdsUnused,
  loadOwnedSession,
  loadProfileSettings,
  loadStoredSets,
  lockUser,
  type OwnedSession,
  placeholderSetRow,
  type StoredSet,
  storedSummary,
} from '../_shared/stores/sessions.ts';
import { type EditSessionPayload, parseEditSessionPayload } from './payload.ts';

interface EditResponse {
  summary: SessionSummary;
  revision: number;
  replayedSessionIds: string[];
  revokedDrops: DropSummary[];
}

function sameSet(requested: SetPayload, stored: StoredSet): boolean {
  const effort = resolveEffort(requested.effort, DEFAULT_BALANCE);
  return (
    requested.exerciseId === stored.exerciseId &&
    requested.position === stored.position &&
    requested.weightKg === stored.weightKg &&
    requested.reps === stored.reps &&
    requested.isWarmup === stored.isWarmup &&
    effort.effortInputType === stored.effortInputType &&
    effort.effortValue === stored.effortValue
  );
}

function isNoOp(payload: EditSessionPayload, session: OwnedSession, storedSets: readonly StoredSet[]): boolean {
  if (payload.notes !== session.notes || payload.sets.length !== storedSets.length) return false;
  const storedById = new Map(storedSets.map((set) => [set.id, set]));
  return payload.sets.every((set) => {
    const stored = storedById.get(set.id);
    return stored !== undefined && sameSet(set, stored);
  });
}

async function loadKnownCatalog(tx: Transaction, userId: string, sets: readonly SetPayload[]): Promise<Catalog> {
  const exerciseIds = [...new Set(sets.map((set) => set.exerciseId))];
  const catalog = await loadCatalog(tx, userId, exerciseIds, true);
  const unknownExerciseIds = exerciseIds.filter((id) => !catalog.exercises.has(id));
  if (unknownExerciseIds.length > 0) throw new HttpError(422, 'unknown_exercise', { exerciseIds: unknownExerciseIds });
  return catalog;
}

async function writeSets(
  tx: Transaction,
  userId: string,
  sessionId: string,
  storedSets: readonly StoredSet[],
  requested: readonly (SetPayload & { effectiveLoadKg: number })[],
): Promise<void> {
  const requestedIds = new Set(requested.map((set) => set.id));
  const storedIds = new Set(storedSets.map((set) => set.id));
  const removedIds = storedSets.filter((set) => !requestedIds.has(set.id)).map((set) => set.id);
  const kept = requested.filter((set) => storedIds.has(set.id));
  const added = requested.filter((set) => !storedIds.has(set.id));

  await tx`set constraints public.sets_session_id_position_key deferred`;
  if (removedIds.length > 0) {
    await tx`delete from public.sets where session_id = ${sessionId} and id = any(${removedIds}::uuid[])`;
  }
  if (kept.length > 0) {
    const rows = kept.map((set) => {
      const effort = resolveEffort(set.effort, DEFAULT_BALANCE);
      return {
        id: set.id,
        exercise_id: set.exerciseId,
        position: set.position,
        weight_kg: set.weightKg,
        effective_load_kg: set.effectiveLoadKg,
        reps: set.reps,
        is_warmup: set.isWarmup,
        effort_input_type: effort.effortInputType,
        effort_value: effort.effortValue,
      };
    });
    await tx`
      update public.sets as target
      set exercise_id = derived.exercise_id,
          position = derived.position,
          weight_kg = derived.weight_kg,
          effective_load_kg = derived.effective_load_kg,
          reps = derived.reps,
          is_warmup = derived.is_warmup,
          effort_input_type = derived.effort_input_type,
          effort_value = derived.effort_value,
          updated_at = now()
      from jsonb_to_recordset(${tx.json(rows as unknown as JsonValue)}) as derived (
        id uuid,
        exercise_id uuid,
        position int,
        weight_kg numeric,
        effective_load_kg numeric,
        reps int,
        is_warmup boolean,
        effort_input_type public.effort_input_type,
        effort_value numeric
      )
      where target.id = derived.id and target.session_id = ${sessionId}`;
  }
  if (added.length > 0) {
    const rows = added.map((set) => placeholderSetRow(set, set.effectiveLoadKg, sessionId, userId, DEFAULT_BALANCE));
    await tx`insert into public.sets ${tx(rows)}`;
  }
}

async function editSession(userId: string, payload: EditSessionPayload): Promise<EditResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);

    const session = await loadOwnedSession(tx, userId, payload.sessionId);
    if (!session) throw new HttpError(404, 'session_not_found');
    const storedSets = await loadStoredSets(tx, payload.sessionId);
    if (isNoOp(payload, session, storedSets)) {
      return { summary: session.summary, revision: session.revision, replayedSessionIds: [], revokedDrops: [] };
    }

    if (session.historyOnly || !isWithinEditWindow(session.key.startedAt, Date.now())) {
      throw new HttpError(409, 'edit_window_closed');
    }
    if (payload.ifRevision !== session.revision) {
      throw new HttpError(409, 'revision_conflict', { revision: session.revision });
    }
    const catalog = await loadKnownCatalog(tx, userId, payload.sets);
    const storedById = new Map(storedSets.map((set) => [set.id, set]));
    const newSetIds = payload.sets.filter((set) => !storedById.has(set.id)).map((set) => set.id);
    if (newSetIds.length > 0) await assertSetIdsUnused(tx, newSetIds);

    const { bodyweightKg } = await loadProfileSettings(tx, userId);
    const requested = payload.sets.map((set) => {
      const exercise = catalog.exercises.get(set.exerciseId)!;
      const stored = storedById.get(set.id);
      const effectiveLoadKg = stored
        ? carriedEffectiveLoadKg(stored, set, exercise, bodyweightKg)
        : effectiveLoadForNewSet(set, exercise, bodyweightKg);
      return { ...set, effectiveLoadKg };
    });

    await writeSets(tx, userId, payload.sessionId, storedSets, requested);
    const [updated] = await tx`
      update public.sessions
      set notes = ${payload.notes}, revision = revision + 1, updated_at = now()
      where id = ${payload.sessionId}
      returning revision`;

    const storedExerciseIds = [...new Set(storedSets.map((set) => set.exerciseId))];
    const { replayedSessionIds, revokedDrops } = await replayFrom(
      tx,
      userId,
      session.key,
      storedExerciseIds,
      DEFAULT_BALANCE,
    );
    return {
      summary: await storedSummary(tx, payload.sessionId),
      revision: updated.revision,
      replayedSessionIds,
      revokedDrops,
    };
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
    const payload = parseEditSessionPayload(body);
    return jsonResponse(await editSession(userId, payload));
  } catch (error) {
    return errorResponse(asHttpError(error));
  }
});
