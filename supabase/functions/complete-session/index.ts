import { authenticatedUserId } from '../_shared/auth.ts';
import { sql, type Transaction } from '../_shared/db.ts';
import {
  BodyweightLoadNotZeroError,
  BodyweightRequiredError,
  DEFAULT_BALANCE,
  processSession,
  type SessionInput,
  type SessionSummary,
  strengthAfterSession,
  strengthStateAt,
  UnknownExerciseError,
} from '../_shared/domain/index.ts';
import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts';
import { loadCatalog } from '../_shared/stores/catalog.ts';
import { loadRecords, saveRecords } from '../_shared/stores/records.ts';
import { exercisesTrainedAfter, loadStrengthHistory, saveCurrentStrength } from '../_shared/stores/strength.ts';
import { assertPlausibleTiming, type CompleteSessionPayload, parseCompleteSessionPayload } from './payload.ts';
import {
  assertSetIdsUnused,
  findSession,
  insertCompletedSession,
  isUniqueViolation,
  loadUserState,
  lockUser,
  ownedProgramDayId,
  type StoredSession,
} from './session-store.ts';

function toSessionInput(payload: CompleteSessionPayload): SessionInput {
  return { id: payload.id, startedAt: payload.startedAt, sets: payload.sets };
}

function warnIfResubmissionDiffers(stored: StoredSession, payload: CompleteSessionPayload): void {
  const resubmittedSetIds = payload.sets.map((set) => set.id).sort();
  const sameSets =
    resubmittedSetIds.length === stored.setIds.length &&
    resubmittedSetIds.every((id, index) => id === stored.setIds[index]);
  if (!sameSets) console.warn(`session ${payload.id} re-submitted with different sets; returning the stored summary`);
}

async function processNewSession(
  tx: Transaction,
  userId: string,
  payload: CompleteSessionPayload,
): Promise<SessionSummary> {
  const session = toSessionInput(payload);
  const exerciseIds = [...new Set(payload.sets.map((set) => set.exerciseId))];
  const catalog = await loadCatalog(tx, userId, exerciseIds, true);
  const unknownExerciseIds = exerciseIds.filter((id) => !catalog.exercises.has(id));
  if (unknownExerciseIds.length > 0) throw new HttpError(422, 'unknown_exercise', { exerciseIds: unknownExerciseIds });

  const { timezone, ...skillsAndBodyweight } = await loadUserState(tx, userId);
  const userState = { ...skillsAndBodyweight, records: await loadRecords(tx, userId, exerciseIds) };
  const history = await loadStrengthHistory(tx, userId, exerciseIds, session, DEFAULT_BALANCE);
  const strength = strengthStateAt(history, session, DEFAULT_BALANCE);

  const { nextState, outputs } = processSession(userState, session, DEFAULT_BALANCE, { catalog, strength });
  const summary: SessionSummary = {
    sessionId: payload.id,
    xpBySkill: outputs.xpBySkill,
    levelUps: outputs.levelUps,
    prs: outputs.prs,
    drops: outputs.drops,
  };

  const storedSummary = await insertCompletedSession(tx, {
    userId,
    payload,
    programDayId: await ownedProgramDayId(tx, userId, payload.programDayId),
    timezone,
    balanceVersion: DEFAULT_BALANCE.version,
    summary,
    sets: outputs.sets,
    nextSkillXp: nextState.skillXp,
  });
  await saveRecords(tx, userId, nextState.records!, exerciseIds);
  const supersededByLaterSessions = await exercisesTrainedAfter(tx, userId, exerciseIds, session);
  const currentStrength = Object.fromEntries(
    Object.entries(strengthAfterSession(strength, outputs.sets)).filter(
      ([exerciseId]) => !supersededByLaterSessions.has(exerciseId),
    ),
  );
  await saveCurrentStrength(
    tx,
    userId,
    currentStrength,
    (exerciseId) => catalog.exercises.get(exerciseId)?.loadType === 'bodyweight',
  );
  return storedSummary;
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

    assertPlausibleTiming(payload, new Date());
    await assertSetIdsUnused(
      tx,
      payload.sets.map((set) => set.id),
    );
    return await processNewSession(tx, userId, payload);
  });
}

function asHttpError(error: unknown): unknown {
  if (isUniqueViolation(error)) return new HttpError(409, 'id_conflict');
  if (error instanceof BodyweightRequiredError) return new HttpError(409, 'bodyweight_required');
  if (error instanceof BodyweightLoadNotZeroError) return new HttpError(422, 'bodyweight_load_not_zero');
  if (error instanceof UnknownExerciseError)
    return new HttpError(422, 'unknown_exercise', { exerciseIds: [error.exerciseId] });
  return error;
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
