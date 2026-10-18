import type { JsonValue, Transaction } from '../db.ts';
import {
  applyXpGrant,
  type BalanceConfig,
  type Catalog,
  challengeSummary,
  DEFAULT_BALANCE,
  isBefore,
  type RevokedDrop,
  lootCandidates,
  measuresRepsCapacity,
  NO_RECORDS,
  priorSkillXp,
  type RecordState,
  recordsFromHistory,
  type ReplayedSession,
  replayHistory,
  revokedInReplayOrder,
  type SessionKey,
  type SessionLootCandidate,
  type SessionSummary,
  type SetResult,
  type StoredSet,
  type StrengthHistoryRow,
} from '../domain/index.ts';
import { HttpError, logUnexpectedError } from '../http.ts';
import { extendCatalog, loadCatalog } from './catalog.ts';
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
import { hasLaterQuestGrants, loadQuestGrantsFrom, loadQuestXpBefore } from './quests.ts';
import { clearRecordCaches, loadRecords, replaceRecordsFor } from './records.ts';
import { derivedSetColumns, setSkillXpRows } from './set-columns.ts';
import {
  markSessionsDerivedAt,
  sessionExerciseIds,
  storedSummary,
  tombstoneSession,
  writeSummaries,
} from './sessions.ts';
import {
  clearStrengthCache,
  loadStrengthHistory,
  type NewestSessionStrength,
  refreshStrengthCache,
  writeStrengthCacheFromNewestSession,
} from './strength.ts';

interface ReplayOutcome {
  replayed: ReplayedSession[];
  catalog: Catalog;
  skillXp: Record<string, number>;
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
  knownCatalog?: Catalog;
}

interface ReplayChanges {
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

interface PriorState {
  suffixIsOnlyTheAnchor: boolean;
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
  if (from === null) return { suffixIsOnlyTheAnchor: false, strength: [], records: NO_RECORDS, skillXp: {} };
  const [strength, laterWork] = await Promise.all([
    loadStrengthHistory(tx, userId, suffixExerciseIds, from, cfg),
    anchorIsNew ? Promise.all([hasLaterSessions(tx, userId, from), hasLaterQuestGrants(tx, userId, from)]) : null,
  ]);
  const suffixIsOnlyTheAnchor = laterWork !== null && !laterWork.includes(true);
  if (suffixIsOnlyTheAnchor) {
    const [records, skillXp] = await Promise.all([loadRecords(tx, userId, allTouched), loadSkillXp(tx, userId)]);
    return { suffixIsOnlyTheAnchor, strength, records, skillXp };
  }
  const [recordHistory, priorSums, questXp] = await Promise.all([
    loadRecordHistory(tx, userId, allTouched, from),
    loadPriorSkillXpSums(tx, userId, from),
    loadQuestXpBefore(tx, userId, from),
  ]);
  return {
    suffixIsOnlyTheAnchor,
    strength,
    records: recordsFromHistory(recordHistory, catalog, cfg),
    skillXp: priorSkillXp(applyXpGrant(priorSums, questXp, cfg), cfg),
  };
}

function newestSessionStrength(
  anchor: ReplayedSession,
  exerciseIds: readonly string[],
  history: readonly StrengthHistoryRow[],
  catalog: Catalog,
): NewestSessionStrength {
  const exercises = exerciseIds.map((exerciseId) => {
    const exercise = catalog.exercises.get(exerciseId);
    return { exerciseId, usesRepsCapacity: exercise?.modality === 'lift' && measuresRepsCapacity(exercise.loadType) };
  });
  const candidates = [...anchor.outputs.sets]
    .sort((a, b) => a.set.position - b.set.position)
    .map((result) => ({
      exerciseId: result.set.exerciseId,
      setId: result.set.id,
      value: result.e1rmCandidateKg ?? result.repsCapacityCandidate ?? null,
    }));
  return { session: anchor.session, exercises, history, candidates };
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

async function replaySessions(
  tx: Transaction,
  userId: string,
  scope: ReplayScope,
  replayStart: SessionKey | null,
  cfg: BalanceConfig,
): Promise<ReplayOutcome> {
  const { from } = scope;
  const suffix = await loadReplayableSessions(tx, userId, replayStart, cfg);
  const suffixExerciseIds = [...new Set(suffix.flatMap((session) => session.sets.map((set) => set.exerciseId)))];
  const touched = [...new Set([...suffixExerciseIds, ...scope.previousExerciseIds])];
  const catalog = scope.knownCatalog
    ? await extendCatalog(tx, userId, scope.knownCatalog, touched)
    : await loadCatalog(tx, userId, touched);
  const [prior, questGrants] = await Promise.all([
    loadPriorState(tx, userId, { ...scope, from: replayStart }, suffixExerciseIds, touched, catalog, cfg),
    loadQuestGrantsFrom(tx, userId, replayStart),
  ]);

  const replay = replayHistory(
    suffix,
    catalog,
    cfg,
    { skillXp: prior.skillXp, bodyweightKg: null, records: prior.records },
    prior.strength,
    questGrants,
  );
  const results = replay.sessions.flatMap((entry) => entry.outputs.sets);

  await rewriteDerivedSetColumns(tx, results);
  const suffixSetIds = results.map((result) => result.set.id);
  if (suffixSetIds.length > 0) await tx`delete from public.set_skill_xp where set_id = any(${suffixSetIds}::uuid[])`;
  const xpRows = setSkillXpRows(results, userId);
  if (xpRows.length > 0) await tx`insert into public.set_skill_xp ${tx(xpRows)}`;

  await replaceSkillXp(tx, userId, replay.finalState.skillXp);
  await replaceRecordsFor(tx, userId, touched, replay.finalState.records ?? NO_RECORDS);
  if (prior.suffixIsOnlyTheAnchor) {
    await writeStrengthCacheFromNewestSession(
      tx,
      userId,
      newestSessionStrength(replay.sessions[0], touched, prior.strength, catalog),
      cfg,
    );
  } else {
    await refreshStrengthCache(tx, userId, touched, cfg);
  }

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

  const requestedSuffix = replay.sessions.filter((entry) => from === null || !isBefore(entry.session, from));
  const replayedSessionIds = requestedSuffix.map((entry) => entry.session.id);
  const sets = requestedSuffix.flatMap((entry) =>
    lootCandidates(entry.outputs.sets, catalog).map((candidate) => ({ ...candidate, sessionId: entry.session.id })),
  );
  const isNewAnchor = (sessionId: string) => scope.anchorIsNew && sessionId === from?.id;
  const revoked =
    from === null
      ? []
      : await revokeDisqualifiedDrops(
          tx,
          userId,
          sets,
          replayedSessionIds.filter((sessionId) => !isNewAnchor(sessionId)),
          {
            editedSessionId: from.id,
            deletedSessionIds: scope.deletedSessionIds,
            unchangedSetIds: scope.unchangedSetIds,
          },
          cfg.version,
        );
  await syncSessionEvents(
    tx,
    userId,
    replay.sessions.map((entry) => entry.session.id).filter((sessionId) => !isNewAnchor(sessionId)),
  );

  return {
    replayed: replay.sessions,
    catalog,
    skillXp: replay.finalState.skillXp,
    sessionsReplayed: replay.sessions.length,
    setsRewritten: results.length,
    replayedSessionIds,
    sets,
    revokedDrops: revokedInReplayOrder(revoked, sets, replayedSessionIds),
  };
}

async function rebuildAndReplay(
  tx: Transaction,
  userId: string,
  scope: ReplayScope,
  cfg: BalanceConfig,
): Promise<ReplayOutcome> {
  await clearStrengthCache(tx, userId);
  await clearRecordCaches(tx, userId);
  const outcome = await replaySessions(tx, userId, scope, null, cfg);
  await markSessionsDerivedAt(tx, userId, cfg.version);
  return outcome;
}

async function rebuildAndReplayOrRefuse(
  tx: Transaction,
  userId: string,
  scope: ReplayScope,
  cfg: BalanceConfig,
): Promise<ReplayOutcome> {
  try {
    return await rebuildAndReplay(tx, userId, scope, cfg);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logUnexpectedError(error);
    throw new HttpError(503, 'rebuild_required');
  }
}

async function replayFrom(
  tx: Transaction,
  userId: string,
  scope: ReplayScope,
  cfg: BalanceConfig,
): Promise<ReplayOutcome> {
  if (scope.from !== null && (await hasStaleDerivedSessions(tx, userId, cfg.version))) {
    return await rebuildAndReplayOrRefuse(tx, userId, scope, cfg);
  }
  return await replaySessions(tx, userId, scope, scope.from, cfg);
}

const NOTHING_PREVIOUS = { previousExerciseIds: [], deletedSessionIds: [], unchangedSetIds: [] };

interface NewSessionDerivation {
  replayed: ReplayedSession;
  catalog: Catalog;
  skillXp: Record<string, number>;
}

export async function deriveNewSession(
  tx: Transaction,
  userId: string,
  key: SessionKey,
  knownCatalog: Catalog,
): Promise<NewSessionDerivation> {
  const outcome = await replayFrom(
    tx,
    userId,
    { from: key, anchorIsNew: true, ...NOTHING_PREVIOUS, knownCatalog },
    DEFAULT_BALANCE,
  );
  await rollNewSessionLoot(
    tx,
    userId,
    key.id,
    outcome.sets.filter((set) => set.sessionId === key.id),
  );
  return {
    replayed: outcome.replayed.find((entry) => entry.session.id === key.id)!,
    catalog: outcome.catalog,
    skillXp: outcome.skillXp,
  };
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
  const { sessionsReplayed, setsRewritten } = await rebuildAndReplay(
    tx,
    userId,
    { from: null, anchorIsNew: false, ...NOTHING_PREVIOUS },
    DEFAULT_BALANCE,
  );
  return { sessionsReplayed, setsRewritten };
}
