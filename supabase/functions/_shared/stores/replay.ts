import type { JsonValue, Transaction } from '../db.ts';
import {
  type BalanceConfig,
  type Catalog,
  DEFAULT_STEPS,
  type LootCandidate,
  lootCandidates,
  NO_RECORDS,
  priorSkillXp,
  type RecordState,
  recordsFromHistory,
  replayHistory,
  type SessionKey,
  type SetResult,
  type StrengthHistoryRow,
} from '../domain/index.ts';
import { HttpError } from '../http.ts';
import { loadCatalog } from './catalog.ts';
import {
  hasLaterSessions,
  hasStaleDerivedSessions,
  loadPriorSkillXpSums,
  loadRecordHistory,
  loadReplayableSessions,
  loadSkillXp,
} from './history.ts';
import { loadRecords, replaceRecordsFor } from './records.ts';
import { derivedSetColumns, setSkillXpRows } from './set-columns.ts';
import { writeSummaries } from './sessions.ts';
import { loadStrengthHistory, refreshStrengthCache } from './strength.ts';

export type ReplayedSet = LootCandidate & { sessionId: string };

export interface ReplayOutcome {
  sessionsReplayed: number;
  setsRewritten: number;
  replayedSessionIds: string[];
  sets: ReplayedSet[];
}

interface PriorState {
  strength: StrengthHistoryRow[];
  records: RecordState;
  skillXp: Record<string, number>;
}

async function loadPriorState(
  tx: Transaction,
  userId: string,
  from: SessionKey | null,
  touchedExerciseIds: readonly string[],
  suffixExerciseIds: readonly string[],
  allTouched: readonly string[],
  catalog: Catalog,
  cfg: BalanceConfig,
): Promise<PriorState> {
  if (from === null) return { strength: [], records: NO_RECORDS, skillXp: {} };
  const strength = await loadStrengthHistory(tx, userId, suffixExerciseIds, from, cfg);
  const suffixIsOnlyTheAnchor = touchedExerciseIds.length === 0 && !(await hasLaterSessions(tx, userId, from));
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
      xp_awarded int
    )
    where target.id = derived.id`;
}

async function replaceSkillXp(tx: Transaction, userId: string, skillXp: Readonly<Record<string, number>>) {
  await tx`delete from public.user_skills where user_id = ${userId}`;
  const rows = Object.entries(skillXp).map(([skillId, xp]) => ({ user_id: userId, skill_id: skillId, xp }));
  if (rows.length > 0) await tx`insert into public.user_skills ${tx(rows)}`;
}

export async function replayFrom(
  tx: Transaction,
  userId: string,
  from: SessionKey | null,
  touchedExerciseIds: readonly string[],
  cfg: BalanceConfig,
): Promise<ReplayOutcome> {
  if (from !== null && (await hasStaleDerivedSessions(tx, userId, cfg.version))) {
    throw new HttpError(503, 'rebuild_required');
  }

  const suffix = await loadReplayableSessions(tx, userId, from, cfg);
  const suffixExerciseIds = [...new Set(suffix.flatMap((session) => session.sets.map((set) => set.exerciseId)))];
  const touched = [...new Set([...suffixExerciseIds, ...touchedExerciseIds])];
  const catalog = await loadCatalog(tx, userId, touched, true);
  const prior = await loadPriorState(tx, userId, from, touchedExerciseIds, suffixExerciseIds, touched, catalog, cfg);

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
      patch: { xpBySkill: entry.outputs.xpBySkill, levelUps: entry.outputs.levelUps, prs: entry.outputs.prs },
    })),
    cfg.version,
  );

  return {
    sessionsReplayed: replay.sessions.length,
    setsRewritten: results.length,
    replayedSessionIds: replay.sessions.map((entry) => entry.session.id),
    sets: replay.sessions.flatMap((entry) =>
      lootCandidates(entry.outputs.sets, catalog).map((candidate) => ({ ...candidate, sessionId: entry.session.id })),
    ),
  };
}
