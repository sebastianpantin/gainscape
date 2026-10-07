begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select tests.create_user('wg_owner') as owner \gset
select tests.create_user('wg_friend') as friend \gset
select tests.create_user('wg_stranger') as stranger \gset
select tests.make_friends(:'owner', :'friend');
update public.profile_private set timezone = 'Pacific/Kiritimati' where user_id = :'owner';
select date_trunc('week', now() at time zone 'Pacific/Kiritimati')::date as this_week \gset

select has_table('public', 'weekly_goals', 'weekly_goals exists');
select col_is_pk('public', 'weekly_goals', array['user_id', 'effective_from'], 'one goal per user and starting week');
select ok(
  has_table_privilege('authenticated', 'public.weekly_goals', 'select')
    and not has_table_privilege('authenticated', 'public.weekly_goals', 'insert')
    and not has_table_privilege('authenticated', 'public.weekly_goals', 'update')
    and not has_table_privilege('authenticated', 'public.weekly_goals', 'delete'),
  'authenticated may only select weekly goals'
);
select is(
  (select array_agg(p.policyname::text order by p.policyname) from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'weekly_goals'),
  array['read own weekly goals'],
  'weekly goals have only the owner read policy'
);
select ok(
  has_function_privilege('authenticated', 'public.set_weekly_session_goal(smallint)', 'execute')
    and not has_function_privilege('anon', 'public.set_weekly_session_goal(smallint)', 'execute'),
  'only authenticated may set a weekly goal'
);

select is(
  (select p.prosecdef and 'search_path=""' = any(p.proconfig) from pg_proc p
   where p.oid = 'public.set_weekly_session_goal(smallint)'::regprocedure),
  true,
  'set_weekly_session_goal runs as definer with an empty search path'
);

select tests.authenticate_as(:'owner');
select is((select count(*)::int from public.weekly_goal_weeks()), 0, 'no goal ever set means no goal weeks');
select is(
  public.set_weekly_session_goal(3::smallint),
  :'this_week'::date,
  'a first goal starts this week, on Monday in the owner''s time zone'
);
select is(
  public.set_weekly_session_goal(4::smallint),
  (:'this_week'::date + 7),
  'a change while a goal is in effect starts next week'
);
select is(
  public.set_weekly_session_goal(null::smallint),
  (:'this_week'::date + 7),
  'turning the goal off also starts next week'
);
select results_eq(
  'select effective_from, goal from public.weekly_goals order by effective_from',
  format($$values (%L::date, 3::smallint), (%L::date, null::smallint)$$, :'this_week', (:'this_week'::date + 7)),
  'a second change in the same week replaces the pending one'
);
select throws_ok(
  'select public.set_weekly_session_goal(0::smallint)',
  '22023',
  'invalid_weekly_goal',
  'a goal below one session is rejected'
);
select throws_ok(
  'select public.set_weekly_session_goal(8::smallint)',
  '22023',
  'invalid_weekly_goal',
  'a goal above seven sessions is rejected'
);
select throws_ok(
  format('insert into public.weekly_goals (user_id, effective_from, goal) values (%L, current_date - 70, 1)', :'owner'),
  '42501',
  null,
  'a client cannot backdate a goal'
);
select throws_ok('update public.weekly_goals set goal = 1', '42501', null, 'a client cannot update weekly goals');
select throws_ok('delete from public.weekly_goals', '42501', null, 'a client cannot delete weekly goals');
reset role;

select throws_ok(
  format('insert into public.weekly_goals (user_id, effective_from, goal) values (%L, %L, 1)', :'owner', (:'this_week'::date + 1)),
  '23514',
  null,
  'a goal always starts on a Monday'
);

delete from public.weekly_goals where user_id = :'owner';
insert into public.weekly_goals (user_id, effective_from, goal) values
  (:'owner', :'this_week'::date - 7, 2),
  (:'owner', :'this_week', null);
select tests.authenticate_as(:'owner');
select is(
  public.set_weekly_session_goal(5::smallint),
  :'this_week'::date,
  'a goal set while the goal is off this week starts this week'
);
reset role;

delete from public.weekly_goals where user_id = :'owner';
insert into public.weekly_goals (user_id, effective_from, goal) values (:'owner', :'this_week'::date + 14, 2);
update public.profile_private set timezone = 'Pacific/Pago_Pago' where user_id = :'owner';
select tests.authenticate_as(:'owner');
select is(
  (select count(*)::int from public.weekly_goal_weeks() where is_current),
  1,
  'a goal starting after this week still leaves a current week row'
);
reset role;
update public.profile_private set timezone = 'Pacific/Kiritimati' where user_id = :'owner';

delete from public.weekly_goals where user_id = :'owner';
insert into public.weekly_goals (user_id, effective_from, goal) values
  (:'owner', :'this_week'::date - 21, 3),
  (:'owner', :'this_week'::date - 7, 2),
  (:'owner', :'this_week'::date + 7, 4);

create function pg_temp.add_local_session(owner uuid, local_day date)
returns uuid language plpgsql as $$
declare
  session_id uuid := tests.add_session(add_local_session.owner, add_local_session.local_day + time '12:00');
begin
  update public.sessions set local_date = add_local_session.local_day where id = session_id;
  return session_id;
end;
$$;

select pg_temp.add_local_session(:'owner', :'this_week'::date - 28);
select pg_temp.add_local_session(:'owner', :'this_week'::date - 21);
select pg_temp.add_local_session(:'owner', :'this_week'::date - 18);
select pg_temp.add_local_session(:'owner', :'this_week'::date - 15);
select pg_temp.add_local_session(:'owner', :'this_week'::date - 10);
select pg_temp.add_local_session(:'owner', :'this_week'::date - 7);
select pg_temp.add_local_session(:'owner', :'this_week'::date - 1) as imported \gset
select pg_temp.add_local_session(:'owner', :'this_week'::date + 2);
select pg_temp.add_local_session(:'friend', :'this_week'::date - 14);
update public.sessions set history_only = true where id = :'imported';

select has_function('public', 'weekly_goal_weeks', array[]::text[], 'weekly_goal_weeks exists');
select ok(
  has_function_privilege('authenticated', 'public.weekly_goal_weeks()', 'execute')
    and not has_function_privilege('anon', 'public.weekly_goal_weeks()', 'execute'),
  'only authenticated may read weekly goal weeks'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.weekly_goal_weeks()'::regprocedure),
  false,
  'weekly_goal_weeks runs as the caller'
);

select tests.authenticate_as(:'owner');
select results_eq(
  'select week_start, goal, sessions, is_current from public.weekly_goal_weeks() order by week_start',
  format(
    $$values (%L::date, 3::smallint, 3, false), (%L::date, 3::smallint, 1, false), (%L::date, 2::smallint, 2, false),
             (%L::date, 2::smallint, 1, true), (%L::date, 4::smallint, 0, false)$$,
    :'this_week'::date - 21, :'this_week'::date - 14, :'this_week'::date - 7, :'this_week', :'this_week'::date + 7
  ),
  'one row per week from the first goal through the pending one, with the goal in effect and every workout counted'
);
select is((select count(*)::int from public.weekly_goals), 3, 'the owner reads their own goals');
reset role;

select tests.authenticate_as(:'friend');
select is((select count(*)::int from public.weekly_goals), 0, 'a friend reads none of the owner''s goals');
select is((select count(*)::int from public.weekly_goal_weeks()), 0, 'a friend without a goal has no goal weeks');
reset role;

select tests.authenticate_as(:'stranger');
select is((select count(*)::int from public.weekly_goals), 0, 'a stranger reads none of the owner''s goals');
reset role;

delete from auth.users where id = :'owner';
select is(
  (select count(*)::int from public.weekly_goals where user_id = :'owner'),
  0,
  'deleting the account deletes its weekly goals'
);

select * from finish();
rollback;
