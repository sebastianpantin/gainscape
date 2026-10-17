begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function tests.owned_row_counts(owner uuid, only_granted boolean)
returns table (table_name text, row_count int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target record;
begin
  for target in
    select c.relname::text as rel, a.attname::text as col
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_class c on c.oid = k.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_class f on f.oid = k.confrelid
    join pg_catalog.pg_namespace fn on fn.oid = f.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
    where k.contype = 'f' and n.nspname = 'public'
      and ((fn.nspname = 'public' and f.relname = 'profiles') or (fn.nspname = 'auth' and f.relname = 'users'))
      and (not owned_row_counts.only_granted or has_table_privilege('authenticated', c.oid, 'select'))
    order by 1, 2
  loop
    table_name := target.rel || '.' || target.col;
    execute format('select count(*)::int from public.%I where %I = $1', target.rel, target.col)
      into row_count using owned_row_counts.owner;
    return next;
  end loop;
end;
$$;
grant usage on schema tests to authenticated;
grant execute on function tests.owned_row_counts(uuid, boolean) to authenticated;

select tests.create_user('so_alpha') as a \gset
select tests.create_user('so_bravo') as b \gset
select tests.create_user('so_charlie') as c \gset
select tests.give_everything(:'a', :'b');
select d.id as day_id, d.program_id
from public.program_days d join public.programs p on p.id = d.program_id
where p.owner_user_id = :'a' \gset

select is(
  (select array_agg(o.table_name order by o.table_name) from tests.owned_row_counts(:'a', false) o
   where o.row_count = 0 and o.table_name <> 'friendships.addressee_id'),
  null,
  'the owner has a row in every user table'
);
select ok(private.are_friends(:'a', :'b'), 'the owner and the friend are accepted friends');
select ok(
  (select count(*) from tests.owned_row_counts(:'a', true)) >= 19,
  'the matrix covers every client-readable user table'
);

select tests.authenticate_as(:'b');
select is(
  (select array_agg(o.table_name order by o.table_name) from tests.owned_row_counts(:'a', true) o where o.row_count > 0),
  null,
  'a friend reads none of the owner''s rows directly'
);
select is((select count(*)::int from public.profile_private where user_id = :'a'), 0, 'a friend cannot read profile_private');
select is((select count(*)::int from public.sets where user_id = :'a'), 0, 'a friend cannot read sets');
select is((select count(*)::int from public.user_skills where user_id = :'a'), 0, 'a friend cannot read user_skills');
select is(
  (select count(*)::int from public.program_days where id = :'day_id')
    + (select count(*)::int from public.program_day_exercises where day_id = :'day_id'),
  0,
  'a friend cannot read the owner''s program days'
);
select throws_ok('select * from public.events', '42501', null, 'a friend cannot select events');
select throws_ok('select * from public.reactions', '42501', null, 'a friend cannot select reactions');
select throws_ok('select * from public.friendships', '42501', null, 'a friend cannot select friendships');
select is((select count(*)::int from public.drop_luck where user_id = :'a'), 0, 'a friend cannot read drop_luck');
reset role;

select tests.authenticate_as(:'c');
select is(
  (select array_agg(o.table_name order by o.table_name) from tests.owned_row_counts(:'a', true) o where o.row_count > 0),
  null,
  'a stranger reads none of the owner''s rows directly'
);
select is((select count(*)::int from public.user_skills where user_id = :'a'), 0, 'a stranger cannot read user_skills');
reset role;

select tests.authenticate_as(:'a');
select is(
  (select array_agg(o.table_name order by o.table_name) from tests.owned_row_counts(:'a', true) o where o.row_count = 0),
  null,
  'the owner reads their own rows in every client-readable user table'
);
select is(
  (select count(*)::int from public.cardio_records where user_id = :'a'),
  1,
  'the owner reads their cardio records'
);
select throws_ok(
  format(
    'insert into public.cardio_records (user_id, exercise_id, kind, value, achieved_at)
     select %L, e.id, ''pace'', 300, now() from public.exercises e where e.key = ''running''',
    :'a'
  ),
  '42501',
  null,
  'a client cannot write cardio records'
);
select throws_ok(
  format(
    'insert into public.sets (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir_source, effective_reps, xp_awarded)
     select gen_random_uuid(), s.id, %L, x.exercise_id, 9, 50, 50, 5, ''default'', 5, 1
     from public.sessions s, public.sets x where s.user_id = %L and x.user_id = %L limit 1',
    :'a', :'a', :'a'
  ),
  '42501',
  null,
  'a client cannot insert sets'
);
select throws_ok(
  format('insert into public.user_skills (user_id, skill_id, xp) select %L, s.id, 1 from public.skills s limit 1', :'a'),
  '42501',
  null,
  'a client cannot insert user_skills'
);
select throws_ok(
  format('insert into public.user_items (user_id, item_id, quantity) select %L, i.id, 5 from public.items i limit 1', :'a'),
  '42501',
  null,
  'a client cannot insert user_items'
);
select is((select count(*)::int from public.drop_luck where user_id = :'a'), 1, 'the owner reads their drop luck');
select throws_ok(
  format('insert into public.drop_luck (user_id, drop_table_id) select %L, t.id from public.drop_tables t where t.key = ''rare''', :'a'),
  '42501',
  null,
  'a client cannot insert drop_luck'
);
select throws_ok(
  format('update public.drop_luck set dry_rolls = 0 where user_id = %L', :'a'),
  '42501',
  null,
  'a client cannot update drop_luck'
);
reset role;

select tests.authenticate_as(:'b');
select is(
  (select count(*)::int from public.cardio_records where user_id = :'a'),
  0,
  'a friend reads none of the owner''s cardio records'
);
reset role;

select * from finish();
rollback;
