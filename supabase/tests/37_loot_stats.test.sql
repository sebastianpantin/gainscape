begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select tests.create_user('loot_stats_owner') as owner \gset
select tests.create_user('loot_stats_stranger') as stranger \gset

create function pg_temp.add_roll(
  owner uuid, session uuid, kind public.roll_kind, local_date date, roll_index int, chance numeric, hit boolean,
  created_at timestamptz)
returns void language sql as $$
  insert into public.loot_rolls
    (user_id, session_id, set_id, kind, local_date, roll_index, drop_table_id, chance, hit, loot_version, created_at)
  select add_roll.owner, add_roll.session, gen_random_uuid(), add_roll.kind, add_roll.local_date, add_roll.roll_index,
         t.id, add_roll.chance, add_roll.hit, 1, add_roll.created_at
  from public.drop_tables t
  where t.key = case add_roll.kind when 'regular' then 'regular' else 'rare' end;
$$;

create function pg_temp.set_dry_rolls(owner uuid, table_key text, dry_rolls int)
returns void language sql as $$
  insert into public.drop_luck (user_id, drop_table_id, dry_rolls)
  select set_dry_rolls.owner, t.id, set_dry_rolls.dry_rolls from public.drop_tables t where t.key = set_dry_rolls.table_key;
$$;

select tests.add_session(:'owner', '2026-10-01 08:00+00') as first \gset
select tests.add_session(:'owner', '2026-10-02 08:00+00') as second \gset
select tests.add_session(:'owner', '2026-10-03 08:00+00') as late_synced \gset
select tests.add_session(:'owner', '2026-10-06 08:00+00') as latest \gset
select gen_random_uuid() as deleted \gset

select pg_temp.add_roll(:'owner', :'first', 'regular', '2026-10-01', 0, 0.1, false, '2026-10-01 09:00+00');
select pg_temp.add_roll(:'owner', :'first', 'regular', '2026-10-01', 1, 0.13, false, '2026-10-01 09:00+00');
select pg_temp.add_roll(:'owner', :'first', 'regular', '2026-10-01', 2, 0.16, true, '2026-10-01 09:00+00');
select pg_temp.add_roll(:'owner', :'first', 'pr', '2026-10-01', 0, 1, true, '2026-10-01 09:00+00');
select pg_temp.add_roll(:'owner', :'second', 'regular', '2026-10-02', 0, 0.1, false, '2026-10-02 09:00+00');
select pg_temp.add_roll(:'owner', :'second', 'regular', '2026-10-02', 1, 0.13, false, '2026-10-02 09:00+00');
select pg_temp.add_roll(:'owner', :'second', 'regular', '2026-10-02', 2, 0.16, false, '2026-10-02 09:00+00');
select pg_temp.add_roll(:'owner', :'deleted', 'regular', '2026-10-04', 0, 0.19, false, '2026-10-04 09:00+00');
select pg_temp.add_roll(:'owner', :'deleted', 'regular', '2026-10-04', 1, 0.22, false, '2026-10-04 09:00+00');
select pg_temp.add_roll(:'owner', :'late_synced', 'regular', '2026-10-03', 0, 0.25, true, '2026-10-05 09:00+00');
select pg_temp.add_roll(:'owner', :'latest', 'regular', '2026-10-06', 0, 0.1, false, '2026-10-06 09:00+00');
select pg_temp.set_dry_rolls(:'owner', 'regular', 1);
select pg_temp.set_dry_rolls(:'owner', 'rare', 9);

select has_function('public', 'loot_stats', array[]::text[], 'loot_stats exists');
select ok(
  has_function_privilege('authenticated', 'public.loot_stats()', 'execute')
    and not has_function_privilege('anon', 'public.loot_stats()', 'execute')
    and not has_function_privilege('public', 'public.loot_stats()', 'execute'),
  'only authenticated may read loot stats'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.loot_stats()'::regprocedure),
  false,
  'loot_stats runs as the caller'
);
select is(
  (select p.provolatile from pg_proc p where p.oid = 'public.loot_stats()'::regprocedure),
  's',
  'loot_stats is stable'
);

select tests.authenticate_as(:'owner');
select is(
  public.loot_stats() - 'longest_dry_streak' - 'current_dry_streak',
  jsonb_build_object('workouts_with_rolls', 4, 'rolls', 9, 'hits', 3, 'expected_drops', 2.13),
  'totals count the regular and PR rolls of kept workouts, expecting the sum of their stored chances'
);
select is(
  (public.loot_stats() ->> 'longest_dry_streak')::int,
  5,
  'the longest dry streak runs over a deleted workout''s misses, in the order the rolls were made'
);
select is(
  (public.loot_stats() ->> 'current_dry_streak')::int,
  1,
  'the current dry streak is the regular table''s bad-luck counter'
);
reset role;

select tests.authenticate_as(:'stranger');
select is(
  public.loot_stats(),
  jsonb_build_object(
    'workouts_with_rolls', 0, 'rolls', 0, 'hits', 0, 'expected_drops', 0,
    'longest_dry_streak', 0, 'current_dry_streak', 0),
  'a stranger reads none of the owner''s rolls and starts at zero'
);
reset role;

select * from finish();
rollback;
