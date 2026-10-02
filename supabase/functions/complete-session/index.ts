import { sql, type Transaction } from '../_shared/db.ts';
import {
  type Catalog,
  DEFAULT_BALANCE,
  HISTORY_ONLY_STEPS,
  historyOnlySummary,
  isWithinEditWindow,
  pendingSummary,
  processSession,
  type SessionInput,
  type SessionSummary,
  type WritableSet,
  writableSetFor,
} from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { loadKnownCatalog } from '../_shared/stores/catalog.ts';
import { rollNewSessionLoot } from '../_shared/stores/loot.ts';
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
  tombstoneOwner,
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

type WritableSession = Omit<SessionInput, 'sets'> & { sets: WritableSet[] };

async function storeHistoryOnly(
  tx: Transaction,
  row: NewSessionRow,
  session: WritableSession,
  catalog: Catalog,
): Promise<SessionSummary> {
  const { outputs } = processSession(
    { skillXp: {}, bodyweightKg: null },
    session,
    DEFAULT_BALANCE,
    { catalog },
    HISTORY_ONLY_STEPS,
  );
  return await insertSession(
    tx,
    { ...row, historyOnly: true, summary: historyOnlySummary(session.id) },
    outputs.sets.map((result) => newSetRow(result, session.id, row.userId)),
  );
}

async function storeAndReplay(tx: Transaction, row: NewSessionRow, session: WritableSession): Promise<SessionSummary> {
  await insertSession(
    tx,
    row,
    session.sets.map((set) => placeholderSetRow(set, session.id, row.userId, DEFAULT_BALANCE)),
  );
  const outcome = await replayFrom(
    tx,
    row.userId,
    { id: session.id, startedAt: session.startedAt },
    [],
    DEFAULT_BALANCE,
  );
  await rollNewSessionLoot(
    tx,
    row.userId,
    session.id,
    outcome.sets.filter((set) => set.sessionId === session.id),
  );
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
    const deletedBy = await tombstoneOwner(tx, payload.id);
    if (deletedBy === userId) throw new HttpError(410, 'session_deleted');
    if (deletedBy !== null) throw new HttpError(409, 'session_id_conflict');

    const now = new Date();
    assertPlausibleTiming(payload, now);
    await assertSetIdsUnused(
      tx,
      payload.sets.map((set) => set.id),
    );
    const catalog = await loadKnownCatalog(tx, userId, payload.sets);
    const profile = await loadProfileSettings(tx, userId);
    const session: WritableSession = {
      id: payload.id,
      startedAt: payload.startedAt,
      sets: payload.sets.map((set): WritableSet => {
        const writable = writableSetFor(set, catalog.exercises.get(set.exerciseId)!, profile.bodyweightKg);
        return writable.kind === 'cardio'
          ? writable
          : { ...writable, recordedEffectiveLoadKg: writable.effectiveLoadKg };
      }),
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
      summary: pendingSummary(payload.id),
      notes: payload.notes,
    };

    await takeRateLimit(tx, 'session_create_hour', userId);
    await takeRateLimit(tx, 'session_create_day', userId);
    if (!isWithinEditWindow(payload.startedAt, now.getTime())) {
      return await storeHistoryOnly(tx, row, session, catalog);
    }
    return await storeAndReplay(tx, row, session);
  });
}

serveAuthenticated(parseCompleteSessionPayload, completeSession);
