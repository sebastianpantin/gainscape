drop function public.last_session_sets(uuid[]);

create function public.recent_lift_sets(exercise_ids uuid[], session_count int)
returns table (exercise_id uuid, session_rank int, weight_kg numeric, reps int, logged_rir numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with lift_sessions as (
    select distinct s.exercise_id, s.session_id, se.started_at
    from public.sets s join public.sessions se on se.id = s.session_id
    where s.user_id = (select auth.uid()) and s.exercise_id = any(exercise_ids) and not s.is_warmup
  ),
  ranked as (
    select
      ls.exercise_id,
      ls.session_id,
      (row_number() over (partition by ls.exercise_id order by ls.started_at desc, ls.session_id desc))::int as session_rank
    from lift_sessions ls
  )
  select
    s.exercise_id,
    r.session_rank,
    s.weight_kg,
    s.reps,
    case when s.rir_source = 'logged' then s.rir end
  from public.sets s join ranked r on r.session_id = s.session_id and r.exercise_id = s.exercise_id
  where not s.is_warmup and r.session_rank <= least(greatest(session_count, 1), 5)
  order by array_position(exercise_ids, s.exercise_id), r.session_rank, s.position;
$$;

revoke execute on function public.recent_lift_sets(uuid[], int) from public, anon;
grant execute on function public.recent_lift_sets(uuid[], int) to authenticated;
