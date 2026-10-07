create table public.weekly_goals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null constraint weekly_goal_starts_on_monday check (extract(isodow from effective_from) = 1),
  goal smallint constraint weekly_goal_is_one_to_seven check (goal between 1 and 7),
  updated_at timestamptz not null default now(),
  primary key (user_id, effective_from)
);

alter table public.weekly_goals enable row level security;
grant select on public.weekly_goals to authenticated;
create policy "read own weekly goals" on public.weekly_goals
  for select to authenticated using (user_id = (select auth.uid()));

create function public.set_weekly_session_goal(goal smallint)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  this_week date;
  goal_in_effect smallint;
  starts date;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if set_weekly_session_goal.goal is not null and set_weekly_session_goal.goal not between 1 and 7 then
    raise exception 'invalid_weekly_goal' using errcode = 'invalid_parameter_value';
  end if;
  perform private.take_rate_limit('profile_update_hour', caller);

  select date_trunc('week', now() at time zone p.timezone)::date into this_week
  from public.profile_private p
  where p.user_id = caller;
  if not found then
    raise exception 'profile_not_found' using errcode = 'no_data_found';
  end if;

  select g.goal into goal_in_effect
  from public.weekly_goals g
  where g.user_id = caller and g.effective_from <= this_week
  order by g.effective_from desc
  limit 1;

  starts := case when goal_in_effect is null then this_week else this_week + 7 end;
  insert into public.weekly_goals (user_id, effective_from, goal)
  values (caller, starts, set_weekly_session_goal.goal)
  on conflict (user_id, effective_from) do update set goal = excluded.goal, updated_at = now();
  return starts;
end;
$$;

revoke execute on function public.set_weekly_session_goal(smallint) from public, anon;
grant execute on function public.set_weekly_session_goal(smallint) to authenticated;

create function public.weekly_goal_weeks()
returns table (week_start date, goal smallint, sessions int, is_current boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with this_week as (
    select date_trunc('week', now() at time zone p.timezone)::date as monday
    from public.profile_private p
    where p.user_id = (select auth.uid())
  ),
  own_goals as (
    select g.effective_from, g.goal from public.weekly_goals g where g.user_id = (select auth.uid())
  ),
  weeks as (
    select generate_series(
      least((select monday from this_week), (select min(effective_from) from own_goals)),
      greatest((select monday from this_week), (select max(effective_from) from own_goals)),
      interval '7 days'
    )::date as week_start
    where exists (select 1 from own_goals)
  ),
  week_sessions as (
    select date_trunc('week', s.local_date::timestamp)::date as week_start, count(*)::int as sessions
    from public.sessions s
    where s.user_id = (select auth.uid())
      and s.local_date >= (select min(week_start) from weeks)
    group by 1
  )
  select
    w.week_start,
    (select g.goal from own_goals g where g.effective_from <= w.week_start order by g.effective_from desc limit 1),
    coalesce(ws.sessions, 0),
    w.week_start = (select monday from this_week)
  from weeks w
  left join week_sessions ws on ws.week_start = w.week_start
  order by w.week_start;
$$;

revoke execute on function public.weekly_goal_weeks() from public, anon;
grant execute on function public.weekly_goal_weeks() to authenticated;
