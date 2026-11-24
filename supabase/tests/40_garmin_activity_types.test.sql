begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select tests.create_user('gat_reader') as reader \gset
select id as yoga from public.exercises where key = 'yoga' and owner_user_id is null \gset

select has_table('public', 'garmin_activity_types', 'Garmin activity types have their own catalog table');
select policies_are(
  'public', 'garmin_activity_types',
  array['read garmin activity types'],
  'Garmin activity types have only the read policy'
);
select is(
  (select array_agg(g.privilege_type::text order by g.privilege_type::text)
   from information_schema.role_table_grants g
   where g.grantee = 'authenticated' and g.table_schema = 'public' and g.table_name = 'garmin_activity_types'),
  array['SELECT'],
  'authenticated may only read Garmin activity types'
);
select ok(
  not has_table_privilege('anon', 'public.garmin_activity_types', 'select'),
  'anon cannot read Garmin activity types'
);
select is(
  (select count(*)::int from public.garmin_activity_types t
   join public.exercises e on e.id = t.exercise_id
   where e.modality <> 'cardio' or e.owner_user_id is not null),
  0,
  'every Garmin activity type maps to a built-in Cardio exercise'
);
select is(
  (select e.key from public.garmin_activity_types t
   join public.exercises e on e.id = t.exercise_id
   where t.key = 'treadmill_running'),
  'running',
  'treadmill running maps to Running'
);
select throws_ok(
  format('insert into public.garmin_activity_types (key, exercise_id) values (%L, %L)', 'Hot Yoga', :'yoga'),
  '23514',
  'new row for relation "garmin_activity_types" violates check constraint "garmin_activity_type_key_format"',
  'a Garmin activity type key keeps the catalog key format'
);

select tests.authenticate_as(:'reader');
select is(
  (select count(*)::int from public.garmin_activity_types),
  13,
  'a signed-in user reads the whole mapping'
);
select throws_ok(
  format('insert into public.garmin_activity_types (key, exercise_id) values (%L, %L)', 'yoga', :'yoga'),
  '42501', 'permission denied for table garmin_activity_types',
  'a signed-in user cannot add a Garmin activity type'
);
select throws_ok(
  format('update public.garmin_activity_types set exercise_id = %L where key = %L', :'yoga', 'running'),
  '42501', 'permission denied for table garmin_activity_types',
  'a signed-in user cannot remap a Garmin activity type'
);
select throws_ok(
  $$delete from public.garmin_activity_types where key = 'running'$$,
  '42501', 'permission denied for table garmin_activity_types',
  'a signed-in user cannot remove a Garmin activity type'
);

select * from finish();
rollback;
