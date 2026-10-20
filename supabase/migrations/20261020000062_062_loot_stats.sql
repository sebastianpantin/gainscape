create function public.loot_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with kept_workout_rolls as (
    select r.session_id, r.chance, r.hit
    from public.loot_rolls r
    join public.sessions s on s.id = r.session_id and s.user_id = r.user_id
    where r.user_id = (select auth.uid())
  ),
  regular_rolls_in_roll_order as (
    select r.hit,
      count(*) filter (where r.hit) over (
        order by r.created_at, r.local_date, r.roll_index, r.id
        rows between unbounded preceding and current row) as hits_so_far
    from public.loot_rolls r
    where r.user_id = (select auth.uid()) and r.kind = 'regular'
  ),
  dry_streaks as (
    select count(*) as length
    from regular_rolls_in_roll_order
    where not hit
    group by hits_so_far
  )
  select jsonb_build_object(
    'workouts_with_rolls', (select count(distinct session_id) from kept_workout_rolls),
    'rolls', (select count(*) from kept_workout_rolls),
    'hits', (select count(*) filter (where hit) from kept_workout_rolls),
    'expected_drops', (select coalesce(sum(chance), 0) from kept_workout_rolls),
    'longest_dry_streak', (select coalesce(max(length), 0) from dry_streaks),
    'current_dry_streak', coalesce(
      (select l.dry_rolls
       from public.drop_luck l
       join public.drop_tables t on t.id = l.drop_table_id
       where l.user_id = (select auth.uid()) and t.key = 'regular'),
      0));
$$;

revoke execute on function public.loot_stats() from public, anon;
grant execute on function public.loot_stats() to authenticated;
