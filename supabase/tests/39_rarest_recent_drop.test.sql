begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select tests.create_user('rarest_drop_owner') as owner \gset
select tests.create_user('rarest_drop_stranger') as stranger \gset

create function pg_temp.add_drop(owner uuid, item_key text, roll_index int, created_at timestamptz, revoked boolean)
returns uuid language sql as $$
  with roll as (
    insert into public.loot_rolls
      (user_id, session_id, set_id, kind, local_date, roll_index, drop_table_id, chance, hit, loot_version, created_at)
    select add_drop.owner, gen_random_uuid(), gen_random_uuid(), 'regular', '2026-10-01', add_drop.roll_index,
           t.id, 0.1, true, 1, add_drop.created_at
    from public.drop_tables t
    where t.key = 'regular'
    returning id, user_id, session_id, set_id
  )
  insert into public.drops
    (user_id, loot_roll_id, session_id, set_id, item_id, quantity, source, created_at,
     revoked_at, revoke_reason, revoked_quantity)
  select roll.user_id, roll.id, roll.session_id, roll.set_id, i.id, 1, 'regular', add_drop.created_at,
         case when add_drop.revoked then now() end,
         case when add_drop.revoked then 'set_removed'::public.revoke_reason end,
         case when add_drop.revoked then 1 end
  from roll, public.items i
  where i.key = add_drop.item_key
  returning id;
$$;

select pg_temp.add_drop(:'owner', 'grinder_scraps', 0, '2026-09-01 08:00+00', false);
select pg_temp.add_drop(:'owner', 'plate_crab', 1, '2026-10-02 08:00+00', true);
select pg_temp.add_drop(:'owner', 'spotter_pup', 2, '2026-10-03 08:00+00', false);
select pg_temp.add_drop(:'owner', 'rookie_belt', 3, '2026-10-04 08:00+00', false);
select pg_temp.add_drop(:'owner', 'grinder_scraps', 10 + n, '2026-10-05 08:00+00'::timestamptz + n * interval '1 minute', false)
from generate_series(0, 119) as n;

select has_function('public', 'rarest_recent_drop', array['timestamp with time zone'], 'rarest_recent_drop exists');
select ok(
  has_function_privilege('authenticated', 'public.rarest_recent_drop(timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.rarest_recent_drop(timestamptz)', 'execute')
    and not has_function_privilege('public', 'public.rarest_recent_drop(timestamptz)', 'execute'),
  'only authenticated may read the rarest recent drop'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.rarest_recent_drop(timestamptz)'::regprocedure),
  false,
  'rarest_recent_drop runs as the caller'
);
select is(
  (select p.provolatile from pg_proc p where p.oid = 'public.rarest_recent_drop(timestamptz)'::regprocedure),
  's',
  'rarest_recent_drop is stable'
);
select is(
  (select p.proconfig from pg_proc p where p.oid = 'public.rarest_recent_drop(timestamptz)'::regprocedure),
  array['search_path=""'],
  'rarest_recent_drop pins an empty search path'
);

select tests.authenticate_as(:'owner');
select is(
  (select key from public.rarest_recent_drop('2026-09-15 00:00+00')),
  'spotter_pup',
  'the rarest kept drop wins over more than a hundred newer commons, and a revoked rarer drop is ignored'
);
select is(
  (select count(*)::int from public.rarest_recent_drop('2026-09-15 00:00+00')),
  1,
  'it returns one item'
);
select is(
  (select key from public.rarest_recent_drop('2026-10-05 00:00+00')),
  'grinder_scraps',
  'drops before the window start do not count'
);
reset role;

select tests.authenticate_as(:'stranger');
select is_empty(
  'select * from public.rarest_recent_drop(''2026-09-01 00:00+00'')',
  'a stranger reads none of the owner''s drops'
);
reset role;

select * from finish();
rollback;
