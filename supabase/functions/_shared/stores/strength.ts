import { isoTimestamp, nullableNumber, type Transaction } from '../db.ts';
import {
  type BalanceConfig,
  currentStrength,
  measuresRepsCapacity,
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
        and st.reps is not null
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
    session: { id: row.session_id, startedAt: isoTimestamp(row.started_at) },
    isWarmup: row.is_warmup,
    strengthCandidate: nullableNumber(row.candidate),
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
    usesRepsCapacity: measuresRepsCapacity(row.load_type),
    session: { id: row.session_id, startedAt: isoTimestamp(row.started_at) },
  }));
}

async function storedCandidates(
  tx: Transaction,
  latest: readonly LatestSessionForExercise[],
): Promise<(StrengthCandidate & { sessionId: string })[]> {
  const rows = await tx`
    select st.session_id, st.exercise_id, st.id, coalesce(st.e1rm_candidate_kg, st.reps_capacity_candidate) as candidate
    from public.sets st
    join unnest(
      ${latest.map((entry) => entry.session.id)}::uuid[],
      ${latest.map((entry) => entry.exerciseId)}::uuid[]
    ) as latest (session_id, exercise_id) on latest.session_id = st.session_id and latest.exercise_id = st.exercise_id
    order by st.session_id, st.position`;
  return rows.map((row) => ({
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    setId: row.id,
    value: nullableNumber(row.candidate),
  }));
}

function exerciseMaxRows(
  userId: string,
  group: readonly LatestSessionForExercise[],
  history: readonly StrengthHistoryRow[],
  candidates: readonly StrengthCandidate[],
  cfg: BalanceConfig,
) {
  const strength = currentStrength(strengthStateAt(history, group[0].session, cfg), candidates);
  return group.flatMap((entry) => {
    const current = strength[entry.exerciseId];
    if (!current) return [];
    return [
      {
        user_id: userId,
        exercise_id: entry.exerciseId,
        e1rm_kg: entry.usesRepsCapacity ? null : current.value,
        reps_capacity: entry.usesRepsCapacity ? current.value : null,
        source_set_id: current.sourceSetId,
      },
    ];
  });
}

async function replaceExerciseMaxes(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  await tx`delete from public.exercise_maxes where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;
  if (rows.length > 0) await tx`insert into public.exercise_maxes ${tx(rows)}`;
}

export async function clearStrengthCache(tx: Transaction, userId: string): Promise<void> {
  await tx`delete from public.exercise_maxes where user_id = ${userId}`;
}

export interface NewestSessionStrength {
  session: SessionKey;
  exercises: readonly { exerciseId: string; usesRepsCapacity: boolean }[];
  history: readonly StrengthHistoryRow[];
  candidates: readonly StrengthCandidate[];
}

export async function writeStrengthCacheFromNewestSession(
  tx: Transaction,
  userId: string,
  newest: NewestSessionStrength,
  cfg: BalanceConfig,
): Promise<void> {
  if (newest.exercises.length === 0) return;
  const group = newest.exercises.map((exercise) => ({ ...exercise, session: newest.session }));
  await replaceExerciseMaxes(
    tx,
    userId,
    group.map((entry) => entry.exerciseId),
    exerciseMaxRows(userId, group, newest.history, newest.candidates, cfg),
  );
}

export async function refreshStrengthCache(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  cfg: BalanceConfig,
): Promise<void> {
  if (exerciseIds.length === 0) return;
  const latest = await latestSessionPerExercise(tx, userId, exerciseIds);
  const groups = [...Map.groupBy(latest, (entry) => entry.session.id).values()];
  const [candidates, ...histories] = await Promise.all([
    storedCandidates(tx, latest),
    ...groups.map((group) =>
      loadStrengthHistory(
        tx,
        userId,
        group.map((entry) => entry.exerciseId),
        group[0].session,
        cfg,
      ),
    ),
  ]);
  const candidatesBySession = Map.groupBy(candidates, (candidate) => candidate.sessionId);
  const rows = groups.flatMap((group, index) =>
    exerciseMaxRows(userId, group, histories[index], candidatesBySession.get(group[0].session.id) ?? [], cfg),
  );
  await replaceExerciseMaxes(tx, userId, exerciseIds, rows);
}
