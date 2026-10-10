import type { JsonValue, Transaction } from '../db.ts';
import {
  type BalanceConfig,
  type Catalog,
  challengeSummary,
  DEFAULT_BALANCE,
  DEFAULT_STEPS,
  type RevokedDrop,
  lootCandidates,
  NO_RECORDS,
  priorSkillXp,
  type RecordState,
  recordsFromHistory,
  replayHistory,
  revokedInReplayOrder,
  type SessionKey,
  type SessionLootCandidate,
  type SessionSummary,
  type SetResult,
  type StoredSet,
  type StrengthHistoryRow,
} from '../domain/index.ts';
import { HttpError } from '../http.ts';
import { loadCatalog } from './catalog.ts';
import { syncSessionEvents } from './events.ts';
import { revokeDisqualifiedDrops, rollNewSessionLoot } from './loot.ts';
import {
  hasLaterSessions,
  hasStaleDerivedSessions,
  loadPriorSkillXpSums,
  loadRecordHistory,
  loadReplayableSessions,
  loadSkillXp,
} from './history.ts';
import { clearRecordCaches, loadRecords, replaceRecordsFor } from './records.ts';
import { derivedSetColumns, setSkillXpRows } from './set-columns.ts';
import {
  markSessionsDerivedAt,
  sessionExerciseIds,
  storedSummary,
  tombstoneSession,
  writeSummaries,
} from './sessions.ts';
import { clearStrengthCache, loadStrengthHistory, refreshStrengthCache } from './strength.ts';

interface ReplayOutcome {
  sessionsReplayed: number;
  setsRewritten: number;
  replayedSessionIds: string[];
  sets: SessionLootCandidate[];
  revokedDrops: RevokedDrop[];
}

interface ReplayScope {
  from: SessionKey | null;
  anchorIsNew: boolean;
  previousExerciseIds: readonly string[];
  deletedSessionIds: readonly string[];
  unchangedSetIds: readonly string[];
}

interface ReplayChanges {
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

interface PriorState {
  strength: StrengthHistoryRow[];
  records: RecordState;
  skillXp: Record<string, number>;
}

async function loadPriorState(
  tx: Transaction,
  userId: string,
  { from, anchorIsNew }: ReplayScope,
  suffixExerciseIds: readonly string[],
  allTouched: readonly string[],
  catalog: Catalog,
  cfg: BalanceConfig,
): Promise<PriorState> {
  if (from === null) return { strength: [], records: NO_RECORDS, skillXp: {} };
  const strength = await loadStrengthHistory(tx, userId, suffixExerciseIds, from, cfg);
  const suffixIsOnlyTheAnchor = anchorIsNew && !(await hasLaterSessions(tx, userId, from));
  if (suffixIsOnlyTheAnchor) {
    return { strength, records: await loadRecords(tx, userId, allTouched), skillXp: await loadSkillXp(tx, userId) };
  }
  return {
    strength,
    records: recordsFromHistory(await loadRecordHistory(tx, userId, allTouched, from), catalog, cfg),
    skillXp: priorSkillXp(await loadPriorSkillXpSums(tx, userId, from), cfg),
  };
}

async function rewriteDerivedSetColumns(tx: Transaction, results: readonly SetResult[]): Promise<void> {
  if (results.length === 0) return;
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
        counted_work_s = derived.counted_work_s,
        pace_flagged = derived.pace_flagged,
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
      xp_awarded int,
      counted_work_s int,
      pace_flagged boolean
    )
    where target.id = derived.id`;
}

async function replaceSkillXp(tx: Transaction, userId: string, skillXp: Readonly<Record<string, number>>) {
  await tx`delete from public.user_skills where user_id = ${userId}`;
  const rows = Object.entries(skillXp).map(([skillId, xp]) => ({ user_id: userId, skill_id: skillId, xp }));
  if (rows.length > 0) await tx`insert into public.user_skills ${tx(rows)}`;
}

async function replayFrom(
  tx: Transaction,
  userId: string,
  scope: ReplayScope,
  cfg: BalanceConfig,
): Promise<ReplayOutcome> {
  const { from } = scope;
  if (from !== null && (await hasStaleDerivedSessions(tx, userId, cfg.version))) {
    throw new HttpError(503, 'rebuild_required');
  }

  const suffix = await loadReplayableSessions(tx, userId, from, cfg);
  const suffixExerciseIds = [...new Set(suffix.flatMap((session) => session.sets.map((set) => set.exerciseId)))];
  const touched = [...new Set([...suffixExerciseIds, ...scope.previousExerciseIds])];
  const catalog = await loadCatalog(tx, userId, touched);
  const prior = await loadPriorState(tx, userId, scope, suffixExerciseIds, touched, catalog, cfg);

  const replay = replayHistory(
    suffix,
    catalog,
    cfg,
    { skillXp: prior.skillXp, bodyweightKg: null, records: prior.records },
    DEFAULT_STEPS,
    prior.strength,
  );
  const results = replay.sessions.flatMap((entry) => entry.outputs.sets);

  await rewriteDerivedSetColumns(tx, results);
  const suffixSetIds = results.map((result) => result.set.id);
  if (suffixSetIds.length > 0) await tx`delete from public.set_skill_xp where set_id = any(${suffixSetIds}::uuid[])`;
  const xpRows = setSkillXpRows(results, userId);
  if (xpRows.length > 0) await tx`insert into public.set_skill_xp ${tx(xpRows)}`;

  await replaceSkillXp(tx, userId, replay.finalState.skillXp);
  await replaceRecordsFor(tx, userId, touched, replay.finalState.records ?? NO_RECORDS);
  await refreshStrengthCache(tx, userId, touched, cfg);

  await writeSummaries(
    tx,
    replay.sessions.map((entry) => ({
      id: entry.session.id,
      patch: {
        xpBySkill: entry.outputs.xpBySkill,
        levelUps: entry.outputs.levelUps,
        prs: entry.outputs.prs,
        gearBonusBySkill: entry.outputs.gearBonusBySkill ?? {},
        challenge: challengeSummary(entry.session.challenge, entry.outputs.challengeVerdict),
        challengeBonusBySkill: entry.outputs.challengeBonusBySkill ?? {},
      },
    })),
    cfg.version,
  );

  const replayedSessionIds = replay.sessions.map((entry) => entry.session.id);
  const sets = replay.sessions.flatMap((entry) =>
    lootCandidates(entry.outputs.sets, catalog).map((candidate) => ({ ...candidate, sessionId: entry.session.id })),
  );
  const revoked =
    from === null
      ? []
      : await revokeDisqualifiedDrops(
          tx,
          userId,
          sets,
          replayedSessionIds,
          {
            editedSessionId: from.id,
            deletedSessionIds: scope.deletedSessionIds,
            unchangedSetIds: scope.unchangedSetIds,
          },
          cfg.version,
        );
  await syncSessionEvents(tx, userId, replayedSessionIds);

  return {
    sessionsReplayed: replay.sessions.length,
    setsRewritten: results.length,
    replayedSessionIds,
    sets,
    revokedDrops: revokedInReplayOrder(revoked, sets, replayedSessionIds),
  };
}

const NOTHING_PREVIOUS = { previousExerciseIds: [], deletedSessionIds: [], unchangedSetIds: [] };

export async function deriveNewSession(tx: Transaction, userId: string, key: SessionKey): Promise<SessionSummary> {
  const outcome = await replayFrom(tx, userId, { from: key, anchorIsNew: true, ...NOTHING_PREVIOUS }, DEFAULT_BALANCE);
  await rollNewSessionLoot(
    tx,
    userId,
    key.id,
    outcome.sets.filter((set) => set.sessionId === key.id),
  );
  return await storedSummary(tx, key.id);
}

export async function deriveEditedSession(
  tx: Transaction,
  userId: string,
  key: SessionKey,
  setsBeforeEdit: readonly StoredSet[],
  unchangedSetIds: readonly string[],
): Promise<ReplayChanges & { summary: SessionSummary }> {
  const { replayedSessionIds, revokedDrops } = await replayFrom(
    tx,
    userId,
    {
      from: key,
      anchorIsNew: false,
      previousExerciseIds: [...new Set(setsBeforeEdit.map((set) => set.exerciseId))],
      deletedSessionIds: [],
      unchangedSetIds,
    },
    DEFAULT_BALANCE,
  );
  return { summary: await storedSummary(tx, key.id), replayedSessionIds, revokedDrops };
}

export async function deleteSessionAndRederive(
  tx: Transaction,
  userId: string,
  key: SessionKey,
): Promise<ReplayChanges> {
  const previousExerciseIds = await sessionExerciseIds(tx, key.id);
  await tombstoneSession(tx, userId, key);
  const { replayedSessionIds, revokedDrops } = await replayFrom(
    tx,
    userId,
    { from: key, anchorIsNew: false, previousExerciseIds, deletedSessionIds: [key.id], unchangedSetIds: [] },
    DEFAULT_BALANCE,
  );
  return { replayedSessionIds, revokedDrops };
}

export async function rebuildDerivedState(tx: Transaction, userId: string) {
  await clearStrengthCache(tx, userId);
  await clearRecordCaches(tx, userId);
  const { sessionsReplayed, setsRewritten } = await replayFrom(
    tx,
    userId,
    { from: null, anchorIsNew: false, ...NOTHING_PREVIOUS },
    DEFAULT_BALANCE,
  );
  await markSessionsDerivedAt(tx, userId, DEFAULT_BALANCE.version);
  return { sessionsReplayed, setsRewritten };
}
