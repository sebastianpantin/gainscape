import { isoTimestamp, nullableNumber, type Transaction } from '../db.ts';
import {
  type BalanceConfig,
  challengeRunFromStored,
  effortInputFromStored,
  gearLoadoutFromStored,
  type RecordHistoryRow,
  type SessionInput,
  type SessionKey,
} from '../domain/index.ts';
import { staleDerivedSession } from './sessions.ts';
import { cardioFieldsFromRow, holdFieldsFromRow, liftFieldsFromRow, setKindOfRow } from './set-columns.ts';

export async function loadReplayableSessions(
  tx: Transaction,
  userId: string,
  from: SessionKey | null,
  cfg: BalanceConfig,
): Promise<SessionInput[]> {
  const rows = await tx`
    select s.id as session_id, s.started_at, s.gear_loadout, s.challenge, st.id as set_id, st.exercise_id, st.position, st.weight_kg,
           st.effective_load_kg, st.reps, st.is_warmup, st.effort_input_type, st.effort_value, st.duration_s,
           st.distance_m, st.interval_work_s, st.interval_rest_s, st.interval_rounds
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
    const identity = { id: row.set_id, exerciseId: row.exercise_id, position: row.position };
    const effort = effortInputFromStored(row.effort_input_type, nullableNumber(row.effort_value), cfg);
    const recordedEffectiveLoadKg = Number(row.effective_load_kg);
    const kind = setKindOfRow(row);
    session.sets.push(
      kind === 'lift'
        ? { ...identity, ...liftFieldsFromRow(row), effort, recordedEffectiveLoadKg }
        : kind === 'hold'
          ? { ...identity, kind: 'hold', ...holdFieldsFromRow(row), effort, recordedEffectiveLoadKg }
          : { ...identity, kind: 'cardio', ...cardioFieldsFromRow(row), effort },
    );
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
    select st.exercise_id, s.id as session_id, s.started_at, st.id as set_id, st.position, st.weight_kg, st.reps,
           st.effective_load_kg,
           st.duration_s, st.distance_m, st.interval_work_s, st.interval_rest_s, st.interval_rounds
    from public.sets st
    join public.sessions s on s.id = st.session_id
    where s.user_id = ${userId}
      and not s.history_only
      and not st.is_warmup
      and st.exercise_id = any(${exerciseIds as string[]}::uuid[])
      and (s.started_at, s.id) < (${before.startedAt}::timestamptz, ${before.id}::uuid)`;
  return rows.map((row): RecordHistoryRow => {
    const identity = {
      exerciseId: row.exercise_id,
      session: { id: row.session_id, startedAt: isoTimestamp(row.started_at) },
      setId: row.set_id,
      position: row.position,
    };
    const kind = setKindOfRow(row);
    if (kind === 'lift') return { ...identity, weightKg: Number(row.weight_kg), reps: row.reps };
    if (kind === 'hold') {
      const { durationS, distanceM } = holdFieldsFromRow(row);
      return { ...identity, kind: 'hold', effectiveLoadKg: Number(row.effective_load_kg), durationS, distanceM };
    }
    return { ...identity, kind: 'cardio', ...cardioFieldsFromRow(row) };
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
