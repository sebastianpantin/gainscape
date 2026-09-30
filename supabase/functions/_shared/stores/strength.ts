import type { Transaction } from '../db.ts';
import type { BalanceConfig, CurrentStrength, SessionKey, StrengthHistoryRow } from '../domain/index.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

export async function saveCurrentStrength(
  tx: Transaction,
  userId: string,
  strengthByExercise: Readonly<Record<string, CurrentStrength>>,
  exerciseUsesRepsCapacity: (exerciseId: string) => boolean,
): Promise<void> {
  const rows = Object.entries(strengthByExercise).map(([exerciseId, current]) => ({
    user_id: userId,
    exercise_id: exerciseId,
    e1rm_kg: exerciseUsesRepsCapacity(exerciseId) ? null : current.value,
    reps_capacity: exerciseUsesRepsCapacity(exerciseId) ? current.value : null,
    source_set_id: current.sourceSetId,
  }));
  if (rows.length === 0) return;
  await tx`
    insert into public.exercise_maxes ${tx(rows)}
    on conflict (user_id, exercise_id) do update
      set e1rm_kg = excluded.e1rm_kg,
          reps_capacity = excluded.reps_capacity,
          source_set_id = excluded.source_set_id,
          updated_at = now()`;
}

export async function exercisesTrainedAfter(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  session: SessionKey,
): Promise<Set<string>> {
  const rows = await tx`
    select distinct st.exercise_id
    from public.sets st
    join public.sessions s on s.id = st.session_id
    where s.user_id = ${userId}
      and not s.history_only
      and st.exercise_id = any(${exerciseIds as string[]}::uuid[])
      and (s.started_at, s.id) > (${session.startedAt}::timestamptz, ${session.id}::uuid)`;
  return new Set(rows.map((row) => row.exercise_id));
}
