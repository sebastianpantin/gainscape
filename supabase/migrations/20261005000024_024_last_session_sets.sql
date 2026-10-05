create function public.last_session_sets(exercise_ids uuid[])
returns table (exercise_id uuid, weight_kg numeric, reps int)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (s.exercise_id) s.exercise_id, s.session_id
    from public.sets s join public.sessions se on se.id = s.session_id
    where s.user_id = (select auth.uid()) and s.exercise_id = any(exercise_ids) and not s.is_warmup
    order by s.exercise_id, se.started_at desc, se.id desc
  )
  select s.exercise_id, s.weight_kg, s.reps
  from public.sets s join latest l on l.session_id = s.session_id and l.exercise_id = s.exercise_id
  where not s.is_warmup
  order by array_position(exercise_ids, s.exercise_id), s.position;
$$;

revoke execute on function public.last_session_sets(uuid[]) from public, anon;
grant execute on function public.last_session_sets(uuid[]) to authenticated;
