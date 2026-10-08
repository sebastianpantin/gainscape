import { sql, type Transaction } from '../_shared/db.ts';
import {
  type Catalog,
  challengeE1rmSnapshot,
  challengeLoadExerciseIds,
  type ChallengeRun,
  DEFAULT_BALANCE,
  HISTORY_ONLY_STEPS,
  historyOnlySummary,
  isWithinEditWindow,
  pendingSummary,
  processSession,
  type SessionInput,
  type SessionSummary,
  strengthStateAt,
  type WritableSet,
  writableSetFor,
} from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { loadKnownCatalog } from '../_shared/stores/catalog.ts';
import { claimChallengeScroll } from '../_shared/stores/challenges.ts';
import { loadEquippedLoadout } from '../_shared/stores/gear.ts';
import { rollNewSessionLoot } from '../_shared/stores/loot.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import {
  assertSetIdsUnused,
  findSession,
  type InsertedSession,
  insertSession,
  linkedProgram,
  loadProfileSettings,
  lockUser,
  type NewSessionRow,
  ownedProgramDayId,
  placeholderSetRow,
  type SessionTiming,
  type StoredSession,
  storedSummary,
  tombstoneOwner,
} from '../_shared/stores/sessions.ts';
import {
  newSetRow,
  type PrescriptionSnapshotColumns,
  prescriptionSnapshotsBySetId,
} from '../_shared/stores/set-columns.ts';
import { loadStrengthHistory } from '../_shared/stores/strength.ts';
import { assertPlausibleTiming, type CompleteSessionPayload, parseCompleteSessionPayload } from './payload.ts';

function warnIfResubmissionDiffers(stored: StoredSession, payload: CompleteSessionPayload): void {
  const resubmittedSetIds = payload.sets.map((set) => set.id).sort();
  const sameSets =
    resubmittedSetIds.length === stored.setIds.length &&
    resubmittedSetIds.every((id, index) => id === stored.setIds[index]);
  if (!sameSets) console.warn(`session ${payload.id} re-submitted with different sets; returning the stored summary`);
}

type WritableSession = Omit<SessionInput, 'sets'> & { sets: WritableSet[] };

type SnapshotsBySetId = ReadonlyMap<string, PrescriptionSnapshotColumns>;

interface CompleteSessionResponse extends SessionSummary, SessionTiming {
  programLinked: boolean;
  completedAt: string;
}

async function storeHistoryOnly(
  tx: Transaction,
  row: NewSessionRow,
  session: WritableSession,
  snapshots: SnapshotsBySetId,
  catalog: Catalog,
): Promise<InsertedSession> {
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
    outputs.sets.map((result) => ({
      ...newSetRow(result, session.id, row.userId),
      ...snapshots.get(result.set.id)!,
    })),
  );
}

async function storeAndReplay(
  tx: Transaction,
  row: NewSessionRow,
  session: WritableSession,
  snapshots: SnapshotsBySetId,
): Promise<InsertedSession> {
  const { completedAt } = await insertSession(
    tx,
    row,
    session.sets.map((set) => ({
      ...placeholderSetRow(set, session.id, row.userId, DEFAULT_BALANCE),
      ...snapshots.get(set.id)!,
    })),
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
  return { summary: await storedSummary(tx, session.id), completedAt };
}

async function claimChallengeRun(
  tx: Transaction,
  userId: string,
  payload: CompleteSessionPayload,
): Promise<ChallengeRun | null> {
  if (payload.challenge === null) return null;
  const claimed = await claimChallengeScroll(tx, userId, payload.challenge.challengeId, payload.id);
  if (claimed === null) return null;
  const key = { id: payload.id, startedAt: payload.startedAt };
  const exerciseIds = challengeLoadExerciseIds(claimed.definition);
  const history = await loadStrengthHistory(tx, userId, exerciseIds, key, DEFAULT_BALANCE);
  const strength = strengthStateAt(history, key, DEFAULT_BALANCE);
  return { ...claimed, e1rmKg: challengeE1rmSnapshot(claimed.definition, strength) };
}

function responseFor(stored: InsertedSession, timing: SessionTiming, programLinked: boolean): CompleteSessionResponse {
  const { startedAt, endedAt, sessionRpe } = timing;
  return { ...stored.summary, programLinked, completedAt: stored.completedAt, startedAt, endedAt, sessionRpe };
}

async function completeSession(userId: string, payload: CompleteSessionPayload): Promise<CompleteSessionResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);

    const existing = await findSession(tx, payload.id);
    if (existing && existing.userId !== userId) throw new HttpError(409, 'session_id_conflict');
    if (existing) {
      warnIfResubmissionDiffers(existing, payload);
      return responseFor(existing, existing, existing.programLinked);
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
    const programLink = await linkedProgram(tx, userId, payload.program);
    const snapshots = prescriptionSnapshotsBySetId(payload.sets, () => programLink !== null);
    const row: NewSessionRow = {
      id: payload.id,
      userId,
      programDayId: await ownedProgramDayId(tx, userId, payload.programDayId),
      programLink,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      timezone: profile.timezone,
      historyOnly: false,
      balanceVersion: DEFAULT_BALANCE.version,
      summary: pendingSummary(payload.id),
      notes: payload.notes,
      sessionRpe: payload.sessionRpe,
      gearLoadout: await loadEquippedLoadout(tx, userId),
      challenge: null,
    };

    await takeRateLimit(tx, 'session_create_hour', userId);
    await takeRateLimit(tx, 'session_create_day', userId);
    const stored = isWithinEditWindow(payload.startedAt, now.getTime())
      ? await storeAndReplay(
          tx,
          { ...row, challenge: await claimChallengeRun(tx, userId, payload) },
          session,
          snapshots,
        )
      : await storeHistoryOnly(tx, row, session, snapshots, catalog);
    return responseFor(stored, row, programLink !== null);
  });
}

serveAuthenticated(parseCompleteSessionPayload, completeSession);
