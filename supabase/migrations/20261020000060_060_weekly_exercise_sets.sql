create function public.weekly_exercise_sets(weeks int)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with first_week as (
    select date_trunc('week', now() at time zone p.timezone)::date
      - 7 * (least(greatest(weekly_exercise_sets.weeks, 1), 52) - 1) as monday
    from public.profile_private p
    where p.user_id = (select auth.uid())
  ),
  week_sets as (
    select date_trunc('week', s.local_date::timestamp)::date as week_start, st.exercise_id, count(*)::int as sets
    from public.sessions s
    join public.sets st on st.session_id = s.id
    where s.user_id = (select auth.uid())
      and s.local_date >= (select monday from first_week)
      and not st.is_warmup
    group by 1, 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('week_start', w.week_start, 'exercise_id', w.exercise_id, 'sets', w.sets)
      order by w.week_start, w.exercise_id),
    '[]'::jsonb)
  from week_sets w;
$$;

revoke execute on function public.weekly_exercise_sets(int) from public, anon;
grant execute on function public.weekly_exercise_sets(int) to authenticated;
