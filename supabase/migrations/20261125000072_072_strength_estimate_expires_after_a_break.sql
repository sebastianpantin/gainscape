create or replace function public.exercise_strength_state(as_of timestamptz, window_days int)
returns table (exercise_id uuid, window_max numeric, fallback_max numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with prior as (
    select st.exercise_id, s.id as session_id, s.started_at, st.is_warmup,
           coalesce(st.e1rm_candidate_kg, st.reps_capacity_candidate) as candidate
    from public.sets st
    join public.sessions s on s.id = st.session_id
    where s.user_id = (select auth.uid())
      and not s.history_only
      and s.started_at < as_of
  ),
  trained as (
    select distinct prior.exercise_id, prior.started_at
    from prior
    where not prior.is_warmup
  ),
  gaps as (
    select trained.exercise_id, trained.started_at,
           trained.started_at - lag(trained.started_at) over (
             partition by trained.exercise_id order by trained.started_at
           ) > make_interval(days => window_days) as follows_a_break
    from trained
  ),
  trained_without_a_break as (
    select gaps.exercise_id,
           coalesce(max(gaps.started_at) filter (where gaps.follows_a_break), '-infinity'::timestamptz) as since
    from gaps
    group by gaps.exercise_id
    having max(gaps.started_at) >= as_of - make_interval(days => window_days)
  ),
  latest_session_with_candidates as (
    select distinct on (prior.exercise_id) prior.exercise_id, prior.session_id
    from prior
    join trained_without_a_break unbroken
      on unbroken.exercise_id = prior.exercise_id and prior.started_at >= unbroken.since
    where prior.candidate is not null
    order by prior.exercise_id, prior.started_at desc, prior.session_id desc
  )
  select prior.exercise_id,
         max(prior.candidate) filter (where prior.started_at >= as_of - make_interval(days => window_days)),
         max(prior.candidate) filter (
           where (prior.exercise_id, prior.session_id) in (
             select latest.exercise_id, latest.session_id from latest_session_with_candidates latest
           )
         )
  from prior
  group by prior.exercise_id
  having bool_or(not prior.is_warmup)
$$;
