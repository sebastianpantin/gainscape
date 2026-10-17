begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function tests.reset_rows_referencing(target uuid)
returns table (column_ref text, row_count int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reference record;
begin
  for reference in
    select n.nspname::text as sch, c.relname::text as rel, a.attname::text as col
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_class c on c.oid = k.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_class f on f.oid = k.confrelid
    join pg_catalog.pg_namespace fn on fn.oid = f.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = any(k.conkey)
    where k.contype = 'f' and n.nspname in ('public', 'private')
      and ((fn.nspname = 'public' and f.relname = 'profiles') or (fn.nspname = 'auth' and f.relname = 'users'))
    order by 1, 2, 3
  loop
    column_ref := reference.sch || '.' || reference.rel || '.' || reference.col;
    execute format('select count(*)::int from %I.%I where %I = $1', reference.sch, reference.rel, reference.col)
      into row_count using reset_rows_referencing.target;
    return next;
  end loop;
end;
$$;

grant execute on function tests.reset_rows_referencing(uuid) to authenticated;

select tests.create_user('reset_owner') as owner \gset
select tests.create_user('reset_friend') as friend \gset
select tests.create_user('reset_bystander') as bystander \gset
select tests.create_user('reset_fan') as fan \gset
select tests.give_everything(:'owner', :'friend');
select tests.give_everything(:'bystander', :'fan');
insert into public.reactions (event_id, user_id)
select e.id, :'bystander' from public.events e where e.user_id = :'owner';
insert into public.reactions (event_id, user_id)
select e.id, :'owner' from public.events e where e.user_id = :'bystander';

create temporary table bystander_before as select * from tests.reset_rows_referencing(:'bystander');
create temporary table fan_before as select * from tests.reset_rows_referencing(:'fan');
create temporary table bystander_reactions_elsewhere as
select r.event_id from public.reactions r join public.events e on e.id = r.event_id
where r.user_id = :'bystander' and e.user_id <> :'owner';
grant select on bystander_before, fan_before, bystander_reactions_elsewhere to authenticated;

select is(
  (select array_agg(p.oid::regprocedure::text) from pg_catalog.pg_proc p where p.proname = 'reset_account_data'),
  array['reset_account_data(text)'],
  'reset_account_data has one signature and takes no user id'
);
select ok(
  (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_catalog.pg_proc p
   where p.oid = 'public.reset_account_data(text)'::regprocedure),
  'reset_account_data is security definer with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.reset_account_data(text)', 'execute')
  and not has_function_privilege('service_role', 'public.reset_account_data(text)', 'execute')
  and has_function_privilege('authenticated', 'public.reset_account_data(text)', 'execute'),
  'only signed-in users can call reset_account_data'
);
select ok(
  not has_function_privilege('authenticated', 'private.resetting_account(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.resetting_account(uuid)', 'execute'),
  'clients cannot call the reset check'
);
select ok(
  not has_table_privilege('authenticated', 'private.account_resets', 'insert')
  and not has_table_privilege('authenticated', 'private.account_resets', 'select')
  and not has_table_privilege('anon', 'private.account_resets', 'insert'),
  'clients cannot mark a reset themselves'
);

select set_config('gainscape.resetting_account', :'bystander', true);
select throws_ok(
  format('delete from public.loot_rolls where user_id = %L', :'bystander'),
  '23001', null,
  'setting a reset flag by hand does not unlock loot rolls'
);
select throws_ok(
  format('delete from public.item_ledger where user_id = %L', :'bystander'),
  '23001', null,
  'nor the item ledger'
);
select set_config('gainscape.resetting_account', '', true);

set local role anon;
select throws_ok(
  $$select public.reset_account_data('RESET')$$,
  '42501', null,
  'anon cannot reset'
);
reset role;

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.reset_account_data('RESET')$$,
  '42501', 'not_authenticated',
  'a token without a user resets nothing'
);
reset role;

select tests.authenticate_as(:'owner');
select throws_ok(
  $$select public.reset_account_data('reset')$$,
  'P0001', 'confirmation_mismatch',
  'the confirmation must be RESET exactly'
);
select throws_ok(
  $$select public.reset_account_data(null)$$,
  'P0001', 'confirmation_mismatch',
  'a missing confirmation is refused'
);
select lives_ok($$select public.reset_account_data('RESET')$$, 'the owner resets their own data');
reset role;

select is((select count(*)::int from public.sessions where user_id = :'owner'), 0, 'the owner''s sessions are gone');
select is((select count(*)::int from public.lift_goals where user_id = :'owner'), 0, 'the owner''s lift goals are gone');
select is(
  (select count(*)::int from private.account_resets),
  0,
  'the reset leaves no mark behind for later statements'
);
select results_eq(
  'select column_ref, row_count from tests.reset_rows_referencing(' || quote_literal(:'bystander') || ')
   where column_ref <> ''public.reactions.user_id'' order by 1',
  'select column_ref, row_count from bystander_before where column_ref <> ''public.reactions.user_id'' order by 1',
  'a bystander keeps every row apart from reactions on the owner''s events'
);
select set_eq(
  format('select event_id from public.reactions where user_id = %L', :'bystander'),
  'select event_id from bystander_reactions_elsewhere',
  'the bystander loses only their reactions on the owner''s events'
);
select results_eq(
  'select column_ref, row_count from tests.reset_rows_referencing(' || quote_literal(:'fan') || ') order by 1',
  'select column_ref, row_count from fan_before order by 1',
  'an unrelated user keeps every row'
);

select * from finish();
rollback;
