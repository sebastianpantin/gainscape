import type { Transaction } from '../db.ts';
import {
  type BalanceConfig,
  currentStrength,
  MS_PER_DAY,
  type SessionKey,
  type StrengthCandidate,
  type StrengthHistoryRow,
  strengthStateAt,
} from '../domain/index.ts';

export async function loadStrengthHistory(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  before: SessionKey,
  cfg: BalanceConfig,
): Promise<StrengthHistoryRow[]> {
  const windowStart = new Date(Date.parse(before.startedAt) - cfg.e1rmWindowDays * MS_PER_DAY).toISOString();
  const rows = await tx`
    with prior as (
      select st.exercise_id, s.id as session_id, s.started_at, st.is_warmup,
             coalesce(st.e1rm_candidate_kg, st.reps_capacity_candidate) as candidate
      from public.sets st
      join public.sessions s on s.id = st.session_id
      where s.user_id = ${userId}
        and not s.history_only
        and st.exercise_id = any(${exerciseIds as string[]}::uuid[])
        and (s.started_at, s.id) < (${before.startedAt}::timestamptz, ${before.id}::uuid)
    ),
    latest_session_with_candidates as (
      select distinct on (exercise_id) exercise_id, session_id
      from prior
      where candidate is not null
      order by exercise_id, started_at desc, session_id desc
    ),
    first_working_set as (
      select distinct on (exercise_id) exercise_id, session_id, started_at
      from prior
      where not is_warmup
      order by exercise_id, started_at, session_id
    )
    select exercise_id, session_id, started_at, is_warmup, candidate
    from prior
    where started_at >= ${windowStart}::timestamptz
       or (exercise_id, session_id) in (select exercise_id, session_id from latest_session_with_candidates)
    union all
    select exercise_id, session_id, started_at, false, null
    from first_working_set`;

  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    session: { id: row.session_id, startedAt: new Date(row.started_at).toISOString() },
    isWarmup: row.is_warmup,
    strengthCandidate: row.candidate === null ? null : Number(row.candidate),
  }));
}

interface LatestSessionForExercise {
  exerciseId: string;
  usesRepsCapacity: boolean;
  session: SessionKey;
}

async function latestSessionPerExercise(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
): Promise<LatestSessionForExercise[]> {
  const rows = await tx`
    select distinct on (st.exercise_id) st.exercise_id, e.load_type, s.id as session_id, s.started_at
    from public.sets st
    join public.sessions s on s.id = st.session_id
    join public.exercises e on e.id = st.exercise_id
    where s.user_id = ${userId}
      and not s.history_only
      and st.exercise_id = any(${exerciseIds as string[]}::uuid[])
    order by st.exercise_id, s.started_at desc, s.id desc`;
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    usesRepsCapacity: row.load_type === 'bodyweight',
    session: { id: row.session_id, startedAt: new Date(row.started_at).toISOString() },
  }));
}

async function storedCandidates(
  tx: Transaction,
  sessionId: string,
  exerciseIds: readonly string[],
): Promise<StrengthCandidate[]> {
  const rows = await tx`
    select exercise_id, id, coalesce(e1rm_candidate_kg, reps_capacity_candidate) as candidate
    from public.sets
    where session_id = ${sessionId} and exercise_id = any(${exerciseIds as string[]}::uuid[])
    order by position`;
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    setId: row.id,
    value: row.candidate === null ? null : Number(row.candidate),
  }));
}

export async function refreshStrengthCache(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  cfg: BalanceConfig,
): Promise<void> {
  if (exerciseIds.length === 0) return;
  await tx`delete from public.exercise_maxes where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;

  const latest = await latestSessionPerExercise(tx, userId, exerciseIds);
  const bySession = Map.groupBy(latest, (entry) => entry.session.id);
  const rows = [];
  for (const group of bySession.values()) {
    const session = group[0].session;
    const groupExerciseIds = group.map((entry) => entry.exerciseId);
    const history = await loadStrengthHistory(tx, userId, groupExerciseIds, session, cfg);
    const strength = currentStrength(
      strengthStateAt(history, session, cfg),
      await storedCandidates(tx, session.id, groupExerciseIds),
    );
    for (const entry of group) {
      const current = strength[entry.exerciseId];
      if (!current) continue;
      rows.push({
        user_id: userId,
        exercise_id: entry.exerciseId,
        e1rm_kg: entry.usesRepsCapacity ? null : current.value,
        reps_capacity: entry.usesRepsCapacity ? current.value : null,
        source_set_id: current.sourceSetId,
      });
    }
  }
  if (rows.length > 0) await tx`insert into public.exercise_maxes ${tx(rows)}`;
}
