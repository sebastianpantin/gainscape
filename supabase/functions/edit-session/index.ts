import { authenticatedUserId } from '../_shared/auth.ts';
import { type JsonValue, sql, type Transaction } from '../_shared/db.ts';
import {
  carriedEffectiveLoadKg,
  DEFAULT_BALANCE,
  effectiveLoadForNewSet,
  type ExerciseDef,
  KindMismatchError,
  resolveEffort,
  type RevokedDrop,
  type SessionSummary,
} from '../_shared/domain/index.ts';
import { asHttpError } from '../_shared/http-errors.ts';
import { HttpError, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serve } from '../_shared/serve.ts';
import type { SetPayload } from '../_shared/session-payload.ts';
import { loadKnownCatalog } from '../_shared/stores/catalog.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import {
  assertSetIdsUnused,
  isEditable,
  loadProfileSettings,
  loadStoredSets,
  lockUser,
  type OwnedSession,
  placeholderSetRow,
  requireOwnedSession,
  type StoredSet,
  storedSummary,
} from '../_shared/stores/sessions.ts';
import { inputColumnsWithEffort, type WritableSet } from '../_shared/stores/set-columns.ts';
import { type EditSessionPayload, parseEditSessionPayload } from './payload.ts';

interface EditResponse {
  summary: SessionSummary;
  revision: number;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

function sameSet(requested: SetPayload, stored: StoredSet): boolean {
  const effort = resolveEffort(requested.effort, DEFAULT_BALANCE, requested.kind);
  const sameEffort = effort.effortInputType === stored.effortInputType && effort.effortValue === stored.effortValue;
  const sameIdentity = requested.exerciseId === stored.exerciseId && requested.position === stored.position;
  if (!sameIdentity || !sameEffort) return false;
  if (requested.kind === 'cardio' || stored.kind === 'cardio') {
    return (
      requested.kind === 'cardio' &&
      stored.kind === 'cardio' &&
      requested.durationS === stored.durationS &&
      requested.distanceM === stored.distanceM &&
      requested.interval?.workS === stored.interval?.workS &&
      requested.interval?.restS === stored.interval?.restS &&
      requested.interval?.rounds === stored.interval?.rounds
    );
  }
  return (
    requested.weightKg === stored.weightKg && requested.reps === stored.reps && requested.isWarmup === stored.isWarmup
  );
}

function assertKindsUnchanged(sets: readonly SetPayload[], storedById: ReadonlyMap<string, StoredSet>): void {
  const changed = sets.filter((set) => {
    const stored = storedById.get(set.id);
    return stored !== undefined && stored.kind !== set.kind;
  });
  if (changed.length > 0) throw new HttpError(422, 'kind_changed', { setIds: changed.map((set) => set.id) });
}

function writableSet(
  set: SetPayload,
  exercise: ExerciseDef,
  stored: StoredSet | undefined,
  bodyweightKg: number | null,
): WritableSet {
  if (set.kind === 'cardio') {
    if (exercise.modality !== 'cardio') throw new KindMismatchError(exercise.id);
    return set;
  }
  const effectiveLoadKg =
    stored?.kind === 'lift'
      ? carriedEffectiveLoadKg(stored, set, exercise, bodyweightKg)
      : effectiveLoadForNewSet(set, exercise, bodyweightKg);
  return { ...set, effectiveLoadKg };
}

function isNoOp(
  payload: EditSessionPayload,
  session: OwnedSession,
  storedById: ReadonlyMap<string, StoredSet>,
): boolean {
  if (payload.notes !== session.notes || payload.sets.length !== storedById.size) return false;
  return payload.sets.every((set) => {
    const stored = storedById.get(set.id);
    return stored !== undefined && sameSet(set, stored);
  });
}

async function writeSets(
  tx: Transaction,
  userId: string,
  sessionId: string,
  storedSets: readonly StoredSet[],
  requested: readonly WritableSet[],
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
    const rows = kept.map((set) => inputColumnsWithEffort(set, DEFAULT_BALANCE));
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
          duration_s = derived.duration_s,
          distance_m = derived.distance_m,
          interval_work_s = derived.interval_work_s,
          interval_rest_s = derived.interval_rest_s,
          interval_rounds = derived.interval_rounds,
          counted_work_s = derived.counted_work_s,
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
        effort_value numeric,
        duration_s int,
        distance_m numeric,
        interval_work_s int,
        interval_rest_s int,
        interval_rounds int,
        counted_work_s int
      )
      where target.id = derived.id and target.session_id = ${sessionId}`;
  }
  if (added.length > 0) {
    const rows = added.map((set) => placeholderSetRow(set, sessionId, userId, DEFAULT_BALANCE));
    await tx`insert into public.sets ${tx(rows)}`;
  }
}

async function editSession(userId: string, payload: EditSessionPayload): Promise<EditResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);

    const session = await requireOwnedSession(tx, userId, payload.sessionId);
    const storedSets = await loadStoredSets(tx, payload.sessionId);
    const storedById = new Map(storedSets.map((set) => [set.id, set]));
    if (isNoOp(payload, session, storedById)) {
      return { summary: session.summary, revision: session.revision, replayedSessionIds: [], revokedDrops: [] };
    }

    if (!isEditable(session, Date.now())) throw new HttpError(409, 'edit_window_closed');
    if (payload.ifRevision !== session.revision) {
      throw new HttpError(409, 'revision_conflict', { revision: session.revision });
    }
    assertKindsUnchanged(payload.sets, storedById);
    const catalog = await loadKnownCatalog(tx, userId, payload.sets);
    const newSetIds = payload.sets.filter((set) => !storedById.has(set.id)).map((set) => set.id);
    if (newSetIds.length > 0) await assertSetIdsUnused(tx, newSetIds);

    const { bodyweightKg } = await loadProfileSettings(tx, userId);
    const requested = payload.sets.map((set) =>
      writableSet(set, catalog.exercises.get(set.exerciseId)!, storedById.get(set.id), bodyweightKg),
    );

    await takeRateLimit(tx, 'session_edit_hour', userId);
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

serve(async (request) => {
  const userId = await authenticatedUserId(request);
  const payload = parseEditSessionPayload(await readJsonBody(request));
  return jsonResponse(await editSession(userId, payload));
}, asHttpError);
