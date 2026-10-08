begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select tests.create_user('sc_owner') as owner \gset
select tests.create_user('sc_newcomer') as newcomer \gset
insert into public.exercises (owner_user_id, name, load_type, equipment)
values (:'owner', 'Owner secret lift', 'external', 'other');

select hasnt_table('public', 'user_unlocks', 'the unlock table is gone');
select hasnt_column('public', 'exercises', 'requires_unlock', 'exercises no longer require an unlock');
select policies_are(
  'public', 'exercises',
  array['read built-in and own exercises'],
  'exercises have only the built-in and own read policy'
);

select tests.authenticate_as(:'newcomer');
select is(
  (select array_agg(e.key order by e.key) from public.exercises e where e.variation_of_id is not null),
  array['dead_stop_row', 'deficit_deadlift', 'pause_bench_press', 'pause_squat', 'spider_curl', 'z_press'],
  'a new user sees all six former scroll variations'
);
select is(
  (select count(*)::int from public.exercises e where e.name = 'Owner secret lift'),
  0,
  'a user cannot see another user''s custom exercise'
);
reset role;

select tests.authenticate_as(:'owner');
select is(
  (select count(*)::int from public.exercises e where e.name = 'Owner secret lift'),
  1,
  'the owner still sees their own custom exercise'
);
reset role;

select * from finish();
rollback;
