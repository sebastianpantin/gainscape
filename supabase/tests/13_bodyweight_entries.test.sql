begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select tests.create_user('bw_owner') as owner \gset
select tests.create_user('bw_friend') as friend \gset
select tests.create_user('bw_stranger') as stranger \gset
select tests.make_friends(:'owner', :'friend');
update public.profile_private set timezone = 'Pacific/Kiritimati' where user_id = :'owner';

select has_table('public', 'bodyweight_entries', 'bodyweight_entries exists');
select col_is_pk('public', 'bodyweight_entries', array['user_id', 'logged_on'], 'one entry per user and day');
select ok(
  has_table_privilege('authenticated', 'public.bodyweight_entries', 'select')
    and not has_table_privilege('authenticated', 'public.bodyweight_entries', 'insert')
    and not has_table_privilege('authenticated', 'public.bodyweight_entries', 'update')
    and not has_table_privilege('authenticated', 'public.bodyweight_entries', 'delete'),
  'authenticated may only select bodyweight entries'
);
select is(
  (select array_agg(p.policyname::text order by p.policyname) from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'bodyweight_entries'),
  array['read own bodyweight entries'],
  'bodyweight entries have only the owner read policy'
);

select tests.authenticate_as(:'owner');
update public.profile_private set height_cm = 180 where user_id = :'owner';
select is((select count(*)::int from public.bodyweight_entries), 0, 'a change without bodyweight logs nothing');

update public.profile_private set bodyweight_kg = 80.5 where user_id = :'owner';
select results_eq(
  'select logged_on, bodyweight_kg from public.bodyweight_entries',
  $$values ((now() at time zone 'Pacific/Kiritimati')::date, 80.50::numeric(5, 2))$$,
  'saving bodyweight logs it on today in the owner''s time zone'
);

update public.profile_private set bodyweight_kg = 79 where user_id = :'owner';
select results_eq(
  'select bodyweight_kg from public.bodyweight_entries',
  $$values (79.00::numeric(5, 2))$$,
  'saving again on the same day replaces the entry'
);

update public.profile_private set bodyweight_kg = null where user_id = :'owner';
select is(
  (select bodyweight_kg from public.bodyweight_entries),
  79.00::numeric(5, 2),
  'clearing bodyweight keeps the logged entry'
);

select throws_ok(
  format('insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (%L, current_date - 3, 70)', :'owner'),
  '42501',
  null,
  'a client cannot insert bodyweight entries'
);
select throws_ok(
  'update public.bodyweight_entries set bodyweight_kg = 70',
  '42501',
  null,
  'a client cannot update bodyweight entries'
);
select throws_ok('delete from public.bodyweight_entries', '42501', null, 'a client cannot delete bodyweight entries');
reset role;

insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (:'owner', '2026-09-01', 81);
select throws_ok(
  format('insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (%L, %L, 19.99)', :'owner', '2026-09-02'),
  '23514',
  null,
  'a bodyweight below 20 kg is rejected'
);
select throws_ok(
  format('insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (%L, %L, 400.01)', :'owner', '2026-09-02'),
  '23514',
  null,
  'a bodyweight above 400 kg is rejected'
);

select tests.authenticate_as(:'owner');
select is((select count(*)::int from public.bodyweight_entries), 2, 'the owner reads their own entries');
reset role;

select tests.authenticate_as(:'friend');
select is((select count(*)::int from public.bodyweight_entries), 0, 'a friend reads none of the owner''s entries');
reset role;

select tests.authenticate_as(:'stranger');
select is((select count(*)::int from public.bodyweight_entries), 0, 'a stranger reads none of the owner''s entries');
reset role;

delete from auth.users where id = :'owner';
select is(
  (select count(*)::int from public.bodyweight_entries where user_id = :'owner'),
  0,
  'deleting the account deletes its bodyweight entries'
);

select * from finish();
rollback;
