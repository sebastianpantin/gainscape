import type { Transaction } from '../db.ts';
import {
  type Catalog,
  type ChallengeRun,
  DEFAULT_BALANCE,
  historyOnlySummary,
  pendingSummary,
  planNewSession,
  type SetResult,
  type WritableSession,
} from '../domain/index.ts';
import type { SetPayload } from '../session-payload.ts';
import { loadKnownCatalog } from './catalog.ts';
import { claimChallengeRun } from './challenges.ts';
import { loadEquippedLoadout } from './gear.ts';
import { loadSkillXp } from './history.ts';
import { advanceQuestsForSession } from './quests.ts';
import { deriveNewSession } from './replay.ts';
import {
  assertSetIdsUnused,
  type InsertedSession,
  insertSession,
  linkedProgram,
  loadProfileSettings,
  type NewSessionRow,
  ownedProgramDayId,
  placeholderSetRow,
  type ProgramLink,
  type SessionTiming,
  storedSummary,
} from './sessions.ts';
import { newSetRow, type PrescriptionSnapshotColumns, prescriptionSnapshotsBySetId } from './set-columns.ts';

export interface NewSessionPayload extends SessionTiming {
  id: string;
  notes: string | null;
  programDayId: string | null;
  program: ProgramLink | null;
  challenge: { challengeId: string } | null;
  sets: SetPayload[];
}

export interface StoredNewSession {
  stored: InsertedSession;
  timing: SessionTiming;
  programLinked: boolean;
  historyOnly: boolean;
}

type SnapshotsBySetId = ReadonlyMap<string, PrescriptionSnapshotColumns>;

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
  catalog: Catalog,
): Promise<InsertedSession> {
  const skillXpBeforeSync = await loadSkillXp(tx, row.userId);
  const { completedAt } = await insertSession(
    tx,
    row,
    session.sets.map((set) => ({
      ...placeholderSetRow(set, session.id, row.userId, DEFAULT_BALANCE),
      ...snapshots.get(set.id)!,
    })),
  );
  const derived = await deriveNewSession(tx, row.userId, { id: session.id, startedAt: session.startedAt }, catalog);
  await advanceQuestsForSession(
    tx,
    row.userId,
    {
      endedAt: row.endedAt,
      replayed: derived.replayed,
      catalog: derived.catalog,
      skillXpBeforeSync,
      skillXpAfterSync: derived.skillXp,
    },
    DEFAULT_BALANCE,
  );
  return { summary: await storedSummary(tx, session.id), completedAt };
}

async function claimedChallenge(
  tx: Transaction,
  userId: string,
  payload: NewSessionPayload,
): Promise<ChallengeRun | null> {
  if (payload.challenge === null) return null;
  const key = { id: payload.id, startedAt: payload.startedAt };
  return await claimChallengeRun(tx, userId, payload.challenge.challengeId, key, DEFAULT_BALANCE);
}

export async function storeNewSession(
  tx: Transaction,
  userId: string,
  payload: NewSessionPayload,
  completedAfter: string | null,
  now: Date,
): Promise<StoredNewSession> {
  const [, catalog, profile, programLink, programDayId, gearLoadout] = await Promise.all([
    assertSetIdsUnused(
      tx,
      payload.sets.map((set) => set.id),
    ),
    loadKnownCatalog(tx, userId, payload.sets),
    loadProfileSettings(tx, userId),
    linkedProgram(tx, userId, payload.program),
    ownedProgramDayId(tx, userId, payload.programDayId),
    loadEquippedLoadout(tx, userId),
  ]);
  const plan = planNewSession(payload, catalog, profile.bodyweightKg, now.getTime(), DEFAULT_BALANCE);
  const snapshots = prescriptionSnapshotsBySetId(payload.sets, () => programLink !== null);
  const row: NewSessionRow = {
    id: payload.id,
    userId,
    programDayId,
    programLink,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    timezone: profile.timezone,
    historyOnly: false,
    balanceVersion: DEFAULT_BALANCE.version,
    summary: pendingSummary(payload.id),
    notes: payload.notes,
    sessionRpe: payload.sessionRpe,
    gearLoadout,
    challenge: null,
    completedAfter,
  };

  const stored =
    plan.mode === 'scored'
      ? await storeAndReplay(
          tx,
          { ...row, challenge: await claimedChallenge(tx, userId, payload) },
          plan.session,
          snapshots,
          catalog,
        )
      : await storeHistoryOnly(tx, row, plan.sets, snapshots);
  return { stored, timing: row, programLinked: programLink !== null, historyOnly: plan.mode === 'history_only' };
}
