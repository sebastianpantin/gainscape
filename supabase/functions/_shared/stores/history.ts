import { isoTimestamp, type Transaction } from '../db.ts';
import {
  type BalanceConfig,
  challengeRunFromStored,
  decodeStoredSet,
  effortInputFromStored,
  gearLoadoutFromStored,
  type RecordHistoryRow,
  type SessionInput,
  type SessionKey,
  type SetInput,
  type StoredSet,
  STORED_SET_COLUMNS,
  type StoredSetColumnRow,
  storedSetColumnsOf,
} from '../domain/index.ts';
import { staleDerivedSession } from './sessions.ts';

const JOINED_SET_COLUMNS = STORED_SET_COLUMNS.map((column) => `st.${column}`);

function replayableSet(stored: StoredSet, cfg: BalanceConfig): SetInput {
  const identity = { id: stored.id, exerciseId: stored.exerciseId, position: stored.position };
  const effort = effortInputFromStored(stored.effortInputType, stored.effortValue, cfg);
  if (stored.kind === 'cardio') {
    const { durationS, distanceM, interval } = stored;
    return { ...identity, kind: 'cardio', durationS, distanceM, interval, effort };
  }
  const recordedEffectiveLoadKg = stored.effectiveLoadKg;
  if (stored.kind === 'hold') {
    const { weightKg, durationS, distanceM } = stored;
    return { ...identity, kind: 'hold', weightKg, durationS, distanceM, effort, recordedEffectiveLoadKg };
  }
  const { weightKg, reps, isWarmup } = stored;
  return { ...identity, weightKg, reps, isWarmup, effort, recordedEffectiveLoadKg };
}

export async function loadReplayableSessions(
  tx: Transaction,
  userId: string,
  from: SessionKey | null,
  cfg: BalanceConfig,
): Promise<SessionInput[]> {
  const rows = await tx`
    select s.id as session_id, s.started_at, s.gear_loadout, s.challenge, ${tx(JOINED_SET_COLUMNS)}
    from public.sessions s
    join public.sets st on st.session_id = s.id
    where s.user_id = ${userId} and not s.history_only
      ${from === null ? tx`` : tx`and (s.started_at, s.id) >= (${from.startedAt}::timestamptz, ${from.id}::uuid)`}
    order by s.started_at, s.id, st.position`;

  const sessions = new Map<string, SessionInput>();
  for (const row of rows) {
    const session: SessionInput = sessions.get(row.session_id) ?? {
      id: row.session_id,
      startedAt: isoTimestamp(row.started_at),
      sets: [],
      gearLoadout: gearLoadoutFromStored(row.gear_loadout),
      challenge: challengeRunFromStored(row.challenge),
    };
    session.sets.push(replayableSet(decodeStoredSet(storedSetColumnsOf(row as StoredSetColumnRow)), cfg));
    sessions.set(row.session_id, session);
  }
  return [...sessions.values()];
}

export async function loadRecordHistory(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  before: SessionKey,
): Promise<RecordHistoryRow[]> {
  const rows = await tx`
    select s.id as session_id, s.started_at, ${tx(JOINED_SET_COLUMNS)}
    from public.sets st
    join public.sessions s on s.id = st.session_id
    where s.user_id = ${userId}
      and not s.history_only
      and not st.is_warmup
      and st.exercise_id = any(${exerciseIds as string[]}::uuid[])
      and (s.started_at, s.id) < (${before.startedAt}::timestamptz, ${before.id}::uuid)`;
  return rows.map((row): RecordHistoryRow => {
    const stored = decodeStoredSet(storedSetColumnsOf(row as StoredSetColumnRow));
    const identity = {
      exerciseId: stored.exerciseId,
      session: { id: row.session_id, startedAt: isoTimestamp(row.started_at) },
      setId: stored.id,
      position: stored.position,
    };
    if (stored.kind === 'lift') return { ...identity, weightKg: stored.weightKg, reps: stored.reps };
    if (stored.kind === 'hold') {
      const { effectiveLoadKg, durationS, distanceM } = stored;
      return { ...identity, kind: 'hold', effectiveLoadKg, durationS, distanceM };
    }
    const { durationS, distanceM, interval } = stored;
    return { ...identity, kind: 'cardio', durationS, distanceM, interval };
  });
}

export async function loadPriorSkillXpSums(
  tx: Transaction,
  userId: string,
  before: SessionKey,
): Promise<Record<string, number>> {
  const rows = await tx`
    select x.skill_id, sum(x.xp)::bigint as xp
    from public.set_skill_xp x
    join public.sets st on st.id = x.set_id
    join public.sessions s on s.id = st.session_id
    where x.user_id = ${userId}
      and not s.history_only
      and (s.started_at, s.id) < (${before.startedAt}::timestamptz, ${before.id}::uuid)
    group by x.skill_id`;
  return Object.fromEntries(rows.map((row) => [row.skill_id, Number(row.xp)]));
}

export async function loadSkillXp(tx: Transaction, userId: string): Promise<Record<string, number>> {
  const rows = await tx`select skill_id, xp from public.user_skills where user_id = ${userId}`;
  return Object.fromEntries(rows.map((row) => [row.skill_id, Number(row.xp)]));
}

export async function hasLaterSessions(tx: Transaction, userId: string, key: SessionKey): Promise<boolean> {
  const [row] = await tx`
    select exists (
      select 1 from public.sessions s
      where s.user_id = ${userId}
        and not s.history_only
        and (s.started_at, s.id) > (${key.startedAt}::timestamptz, ${key.id}::uuid)
    ) as later`;
  return row.later;
}

export async function hasStaleDerivedSessions(tx: Transaction, userId: string, version: number): Promise<boolean> {
  const [row] = await tx`
    select exists (
      select 1 from public.sessions
      where user_id = ${userId} and ${staleDerivedSession(tx, version)}
    ) as stale`;
  return row.stale;
}
