import { sql, type Transaction } from '../_shared/db.ts';
import {
  type ChallengeRun,
  DEFAULT_BALANCE,
  historyOnlySummary,
  isNoOpEdit,
  pendingSummary,
  planNewSession,
  type SessionSummary,
  type SetResult,
  type WritableSession,
} from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { loadKnownCatalog } from '../_shared/stores/catalog.ts';
import { claimChallengeRun } from '../_shared/stores/challenges.ts';
import { loadEquippedLoadout } from '../_shared/stores/gear.ts';
import { deriveNewSession } from '../_shared/stores/replay.ts';
import {
  assertSetIdsUnused,
  findSession,
  type InsertedSession,
  insertSession,
  linkedProgram,
  loadProfileSettings,
  loadStoredSets,
  lockUser,
  type NewSessionRow,
  ownedProgramDayId,
  placeholderSetRow,
  type SessionTiming,
  type StoredSession,
  tombstoneOwner,
} from '../_shared/stores/sessions.ts';
import {
  newSetRow,
  type PrescriptionSnapshotColumns,
  prescriptionSnapshotsBySetId,
} from '../_shared/stores/set-columns.ts';
import { assertPlausibleTiming, type CompleteSessionPayload, parseCompleteSessionPayload } from './payload.ts';

async function resubmissionDiffers(
  tx: Transaction,
  stored: StoredSession,
  payload: CompleteSessionPayload,
): Promise<boolean> {
  if (payload.sessionRpe !== stored.sessionRpe) return true;
  const storedSets = await loadStoredSets(tx, payload.id);
  const storedById = new Map(storedSets.map((set) => [set.id, set]));
  return !isNoOpEdit(payload, stored.notes, storedById, DEFAULT_BALANCE);
}

type SnapshotsBySetId = ReadonlyMap<string, PrescriptionSnapshotColumns>;

interface CompleteSessionResponse extends SessionSummary, SessionTiming {
  programLinked: boolean;
  completedAt: string;
  storedContentDiffers?: true;
}

async function storeHistoryOnly(
  tx: Transaction,
  row: NewSessionRow,
  sets: readonly SetResult[],
  snapshots: SnapshotsBySetId,
): Promise<InsertedSession> {
  return await insertSession(
    tx,
    { ...row, historyOnly: true, summary: historyOnlySummary(row.id) },
    sets.map((result) => ({
      ...newSetRow(result, row.id, row.userId),
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
  const summary = await deriveNewSession(tx, row.userId, { id: session.id, startedAt: session.startedAt });
  return { summary, completedAt };
}

async function claimedChallenge(
  tx: Transaction,
  userId: string,
  payload: CompleteSessionPayload,
): Promise<ChallengeRun | null> {
  if (payload.challenge === null) return null;
  const key = { id: payload.id, startedAt: payload.startedAt };
  return await claimChallengeRun(tx, userId, payload.challenge.challengeId, key, DEFAULT_BALANCE);
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
      const stored = responseFor(existing, existing, existing.programLinked);
      return (await resubmissionDiffers(tx, existing, payload)) ? { ...stored, storedContentDiffers: true } : stored;
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
    const plan = planNewSession(payload, catalog, profile.bodyweightKg, now.getTime(), DEFAULT_BALANCE);
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
    const stored =
      plan.mode === 'scored'
        ? await storeAndReplay(
            tx,
            { ...row, challenge: await claimedChallenge(tx, userId, payload) },
            plan.session,
            snapshots,
          )
        : await storeHistoryOnly(tx, row, plan.sets, snapshots);
    return responseFor(stored, row, programLink !== null);
  });
}

serveAuthenticated(parseCompleteSessionPayload, completeSession);
