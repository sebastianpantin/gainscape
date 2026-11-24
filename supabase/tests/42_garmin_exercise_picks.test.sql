begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select tests.create_user('gp_owner') as owner \gset
select tests.create_user('gp_stranger') as stranger \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as squat from public.exercises where key = 'back_squat' \gset

insert into public.exercises (id, owner_user_id, name, load_type, equipment)
values ('00000000-0000-4000-8000-0000000000c1', :'owner', 'Picked custom lift', 'external', 'other');

insert into public.garmin_exercise_picks (user_id, category, exercise_id)
values
  (:'owner', 'bench_press', :'bench'),
  (:'owner', 'row', '00000000-0000-4000-8000-0000000000c1'),
  (:'stranger', 'bench_press', :'squat');

select has_table('public', 'garmin_exercise_picks', 'remembered exercise picks have their own table');
select policies_are(
  'public', 'garmin_exercise_picks',
  array['read own garmin exercise picks'],
  'remembered exercise picks have only the own-rows read policy'
);
select is(
  (select array_agg(g.privilege_type::text order by g.privilege_type::text)
   from information_schema.role_table_grants g
   where g.grantee = 'authenticated' and g.table_schema = 'public' and g.table_name = 'garmin_exercise_picks'),
  array['SELECT'],
  'authenticated may only read remembered exercise picks'
);
select ok(
  not has_table_privilege('anon', 'public.garmin_exercise_picks', 'select'),
  'anon cannot read remembered exercise picks'
);
select col_is_pk(
  'public', 'garmin_exercise_picks', array['user_id', 'category'],
  'a user remembers one exercise per Garmin category'
);
select throws_ok(
  format('insert into public.garmin_exercise_picks (user_id, category, exercise_id) values (%L, %L, %L)',
         :'owner', 'Bench Press', :'bench'),
  '23514',
  'new row for relation "garmin_exercise_picks" violates check constraint "garmin_exercise_pick_category_format"',
  'the category keeps the Garmin key format'
);
select throws_ok(
  format('insert into public.garmin_exercise_picks (user_id, category, exercise_id) values (%L, %L, %L)',
         :'owner', 'unknown', :'bench'),
  '23514',
  'new row for relation "garmin_exercise_picks" violates check constraint "garmin_exercise_pick_category_is_known"',
  'nothing is remembered for the unknown category'
);
select throws_ok(
  format('insert into public.garmin_exercise_picks (user_id, category, exercise_id) values (%L, %L, %L)',
         :'owner', 'curl', '00000000-0000-4000-8000-0000000000ff'),
  '23503', null,
  'a pick names an exercise that exists'
);

select tests.authenticate_as(:'owner');
select is(
  (select array_agg(p.category order by p.category) from public.garmin_exercise_picks p),
  array['bench_press', 'row'],
  'a user reads their own remembered picks and nobody else''s'
);
select throws_ok(
  format('insert into public.garmin_exercise_picks (user_id, category, exercise_id) values (%L, %L, %L)',
         :'owner', 'curl', :'bench'),
  '42501', 'permission denied for table garmin_exercise_picks',
  'a signed-in user cannot add a remembered pick'
);
select throws_ok(
  $$update public.garmin_exercise_picks set category = 'curl'$$,
  '42501', 'permission denied for table garmin_exercise_picks',
  'a signed-in user cannot change a remembered pick'
);
select throws_ok(
  $$delete from public.garmin_exercise_picks$$,
  '42501', 'permission denied for table garmin_exercise_picks',
  'a signed-in user cannot forget a remembered pick'
);
reset role;

delete from public.exercises where id = '00000000-0000-4000-8000-0000000000c1';
select is(
  (select array_agg(p.category order by p.category) from public.garmin_exercise_picks p where p.user_id = :'owner'),
  array['bench_press'],
  'deleting a custom exercise forgets the pick that named it'
);

select tests.authenticate_as(:'owner');
select lives_ok($$select public.reset_account_data('RESET')$$, 'the owner resets their data');
reset role;
select is(
  (select array[
     (select count(*)::int from public.garmin_exercise_picks where user_id = :'owner'),
     (select count(*)::int from public.garmin_exercise_picks where user_id = :'stranger')]),
  array[0, 1],
  'a data reset forgets the caller''s remembered picks and nobody else''s'
);

delete from auth.users where id = :'stranger';
select is(
  (select count(*)::int from public.garmin_exercise_picks where user_id = :'stranger'),
  0,
  'deleting an account removes its remembered picks'
);

select * from finish();
rollback;
