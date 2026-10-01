create function public.exercise_strength_state(as_of timestamptz, window_days int)
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
  latest_session_with_candidates as (
    select distinct on (prior.exercise_id) prior.exercise_id, prior.session_id
    from prior
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

revoke execute on function public.exercise_strength_state(timestamptz, int) from public, anon;
grant execute on function public.exercise_strength_state(timestamptz, int) to authenticated;
