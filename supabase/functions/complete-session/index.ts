import { authenticatedUserId } from '../_shared/auth.ts';
import { sql, type Transaction } from '../_shared/db.ts';
import {
  type Catalog,
  DEFAULT_BALANCE,
  effectiveLoadForNewSet,
  HISTORY_ONLY_STEPS,
  isWithinEditWindow,
  processSession,
  type SessionInput,
  type SessionSummary,
} from '../_shared/domain/index.ts';
import { asHttpError } from '../_shared/http-errors.ts';
import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts';
import { loadCatalog } from '../_shared/stores/catalog.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import {
  assertSetIdsUnused,
  findSession,
  insertSession,
  loadProfileSettings,
  lockUser,
  type NewSessionRow,
  ownedProgramDayId,
  placeholderSetRow,
  type StoredSession,
  storedSummary,
} from '../_shared/stores/sessions.ts';
import { newSetRow } from '../_shared/stores/set-columns.ts';
import { assertPlausibleTiming, type CompleteSessionPayload, parseCompleteSessionPayload } from './payload.ts';

function warnIfResubmissionDiffers(stored: StoredSession, payload: CompleteSessionPayload): void {
  const resubmittedSetIds = payload.sets.map((set) => set.id).sort();
  const sameSets =
    resubmittedSetIds.length === stored.setIds.length &&
    resubmittedSetIds.every((id, index) => id === stored.setIds[index]);
  if (!sameSets) console.warn(`session ${payload.id} re-submitted with different sets; returning the stored summary`);
}

async function loadKnownCatalog(tx: Transaction, userId: string, payload: CompleteSessionPayload): Promise<Catalog> {
  const exerciseIds = [...new Set(payload.sets.map((set) => set.exerciseId))];
  const catalog = await loadCatalog(tx, userId, exerciseIds, true);
  const unknownExerciseIds = exerciseIds.filter((id) => !catalog.exercises.has(id));
  if (unknownExerciseIds.length > 0) throw new HttpError(422, 'unknown_exercise', { exerciseIds: unknownExerciseIds });
  return catalog;
}

async function storeHistoryOnly(
  tx: Transaction,
  row: NewSessionRow,
  session: SessionInput,
  catalog: Catalog,
): Promise<SessionSummary> {
  const { outputs } = processSession(
    { skillXp: {}, bodyweightKg: null },
    session,
    DEFAULT_BALANCE,
    { catalog },
    HISTORY_ONLY_STEPS,
  );
  const summary: SessionSummary = {
    sessionId: session.id,
    xpBySkill: {},
    levelUps: [],
    prs: [],
    drops: [],
    historyOnly: true,
  };
  return await insertSession(
    tx,
    { ...row, historyOnly: true, summary },
    outputs.sets.map((result) => newSetRow(result, session.id, row.userId)),
  );
}

async function storeAndReplay(tx: Transaction, row: NewSessionRow, session: SessionInput): Promise<SessionSummary> {
  await insertSession(
    tx,
    row,
    session.sets.map((set) =>
      placeholderSetRow(set, set.recordedEffectiveLoadKg!, session.id, row.userId, DEFAULT_BALANCE),
    ),
  );
  await replayFrom(tx, row.userId, { id: session.id, startedAt: session.startedAt }, [], DEFAULT_BALANCE);
  return await storedSummary(tx, session.id);
}

async function completeSession(userId: string, payload: CompleteSessionPayload): Promise<SessionSummary> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);

    const existing = await findSession(tx, payload.id);
    if (existing && existing.userId !== userId) throw new HttpError(409, 'session_id_conflict');
    if (existing) {
      warnIfResubmissionDiffers(existing, payload);
      return existing.summary;
    }

    const now = new Date();
    assertPlausibleTiming(payload, now);
    await assertSetIdsUnused(
      tx,
      payload.sets.map((set) => set.id),
    );
    const catalog = await loadKnownCatalog(tx, userId, payload);
    const profile = await loadProfileSettings(tx, userId);
    const session: SessionInput = {
      id: payload.id,
      startedAt: payload.startedAt,
      sets: payload.sets.map((set) => ({
        ...set,
        recordedEffectiveLoadKg: effectiveLoadForNewSet(
          set,
          catalog.exercises.get(set.exerciseId)!,
          profile.bodyweightKg,
        ),
      })),
    };
    const row: NewSessionRow = {
      id: payload.id,
      userId,
      programDayId: await ownedProgramDayId(tx, userId, payload.programDayId),
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      timezone: profile.timezone,
      historyOnly: false,
      balanceVersion: DEFAULT_BALANCE.version,
      summary: { sessionId: payload.id, drops: [] },
      notes: payload.notes,
    };

    if (!isWithinEditWindow(payload.startedAt, now.getTime())) {
      return await storeHistoryOnly(tx, row, session, catalog);
    }
    return await storeAndReplay(tx, row, session);
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
    const payload = parseCompleteSessionPayload(body);
    return jsonResponse(await completeSession(userId, payload));
  } catch (error) {
    return errorResponse(asHttpError(error));
  }
});
