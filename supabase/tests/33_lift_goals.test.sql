begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select tests.create_user('goal_alpha') as a \gset
select tests.create_user('goal_bravo') as b \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select id as deadlift from public.exercises where key = 'deadlift' \gset
select gen_random_uuid() as custom_b \gset
select gen_random_uuid() as archived_a \gset
insert into public.exercises (id, owner_user_id, name, load_type, equipment)
values (:'custom_b', :'b', 'Bravo private lift', 'external', 'other'),
       (:'archived_a', :'a', 'Alpha retired lift', 'external', 'other');
update public.exercises set archived_at = now() where id = :'archived_a';

select has_table('public', 'lift_goals', 'lift_goals exists');
select col_is_pk('public', 'lift_goals', array['user_id', 'exercise_id'], 'one goal per user and exercise');
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.lift_goals'::regclass),
  'lift_goals has row level security'
);
select ok(
  has_table_privilege('authenticated', 'public.lift_goals', 'select')
    and has_table_privilege('authenticated', 'public.lift_goals', 'insert')
    and has_table_privilege('authenticated', 'public.lift_goals', 'delete')
    and not has_table_privilege('anon', 'public.lift_goals', 'select'),
  'signed-in users read, add and remove goals; anon has no access'
);
select ok(
  has_column_privilege('authenticated', 'public.lift_goals', 'target_kg', 'update')
    and has_column_privilege('authenticated', 'public.lift_goals', 'reps', 'update')
    and has_column_privilege('authenticated', 'public.lift_goals', 'target_date', 'update')
    and not has_column_privilege('authenticated', 'public.lift_goals', 'exercise_id', 'update')
    and not has_column_privilege('authenticated', 'public.lift_goals', 'user_id', 'update')
    and not has_column_privilege('authenticated', 'public.lift_goals', 'updated_at', 'update'),
  'a client edits only the target of a goal'
);
select ok(
  not has_function_privilege('anon', 'public.save_lift_goal(uuid, numeric, integer, date)', 'execute')
    and has_function_privilege('authenticated', 'public.save_lift_goal(uuid, numeric, integer, date)', 'execute'),
  'only signed-in users can save a goal'
);
select throws_ok(
  format('select public.save_lift_goal(%L, 100, 5, null)', :'bench'),
  '42501', 'not_authenticated', 'saving a goal needs a signed-in user'
);
select results_eq(
  $$select bucket, max_hits, window_seconds from private.rate_limit_rules where bucket = 'lift_goal_save_hour'$$,
  $$values ('lift_goal_save_hour', 120, 3600)$$,
  'the lift goal write bucket exists with its limit'
);

select tests.authenticate_as(:'a');
select lives_ok(
  format('select public.save_lift_goal(%L, 100, 5, %L)', :'bench', '2026-12-01'),
  'the owner saves a goal'
);
select results_eq(
  format('select target_kg, reps, target_date from public.lift_goals where user_id = %L', :'a'),
  $$values (100.00::numeric(6, 2), 5, '2026-12-01'::date)$$,
  'the owner reads their goal'
);
select lives_ok(
  format('select public.save_lift_goal(%L, 102.058, 3, null)', :'bench'),
  'saving again edits the goal'
);
select results_eq(
  format('select target_kg, reps, target_date from public.lift_goals where user_id = %L', :'a'),
  $$values (102.06::numeric(6, 2), 3, null::date)$$,
  'the edit replaces the target, rounds it to 2 decimals and clears the date'
);
select ok(
  (select updated_at >= created_at from public.lift_goals where user_id = :'a' and exercise_id = :'bench'),
  'an edit keeps the creation time'
);
select lives_ok(
  format('update public.lift_goals set reps = 4 where exercise_id = %L', :'bench'),
  'the owner edits the goal directly'
);
select is(
  (select reps from public.lift_goals where user_id = :'a' and exercise_id = :'bench'),
  4,
  'the direct edit is saved'
);
select lives_ok(
  format('insert into public.lift_goals (exercise_id, target_kg, reps) values (%L, 140, 1)', :'squat'),
  'the owner adds a goal directly'
);
select throws_ok(
  format('select public.save_lift_goal(%L, 0, 5, null)', :'squat'),
  '23514', null, 'a goal weight must be above zero'
);
select throws_ok(
  format('select public.save_lift_goal(%L, 2000.01, 1, null)', :'squat'),
  '23514', null, 'a goal weight is at most the 2000 kg set load cap'
);
select lives_ok(
  format('select public.save_lift_goal(%L, 2000, 1, null)', :'deadlift'),
  'a goal weight of exactly 2000 kg is saved'
);
select throws_ok(
  format('select public.save_lift_goal(%L, 100, 11, null)', :'squat'),
  '23514', null, 'a goal is for 1 to 10 reps'
);
select throws_ok(
  format('select public.save_lift_goal(%L, 100, 0, null)', :'squat'),
  '23514', null, 'a goal needs at least 1 rep'
);
select throws_ok(
  format('select public.save_lift_goal(%L, 100, 5, null)', :'custom_b'),
  '42501', null, 'a goal on another user''s custom exercise is refused'
);
select throws_ok(
  format('select public.save_lift_goal(%L, 100, 5, null)', :'archived_a'),
  '42501', null, 'a goal on an archived exercise is refused'
);
select throws_ok(
  format('insert into public.lift_goals (user_id, exercise_id, target_kg, reps) values (%L, %L, 100, 5)', :'b', :'squat'),
  '42501', null, 'a user cannot add a goal for another user'
);
select throws_ok(
  format('update public.lift_goals set exercise_id = %L where exercise_id = %L', :'archived_a', :'squat'),
  '42501', null, 'a goal cannot move to another exercise'
);
reset role;

select tests.authenticate_as(:'b');
select is((select count(*)::int from public.lift_goals where user_id = :'a'), 0, 'another user reads none of the goals');
select lives_ok(
  format('update public.lift_goals set target_kg = 1 where user_id = %L', :'a'),
  'another user''s edit of the goals runs against no rows'
);
select lives_ok(
  format('delete from public.lift_goals where user_id = %L', :'a'),
  'another user''s delete of the goals runs against no rows'
);
reset role;

select is(
  (select count(*)::int from public.lift_goals where user_id = :'a' and target_kg > 1),
  3,
  'the owner''s goals survive the other user''s edit and delete'
);

select tests.authenticate_as(:'a');
select lives_ok(
  format('delete from public.lift_goals where exercise_id in (%L, %L)', :'squat', :'deadlift'),
  'the owner removes a goal'
);
reset role;
select is(
  (select array_agg(exercise_id) from public.lift_goals where user_id = :'a'),
  array[:'bench'::uuid],
  'only the removed goal is gone'
);

insert into private.rate_limit_hits (bucket, subject, window_start, hits)
values ('lift_goal_save_hour', :'a', to_timestamp(floor(extract(epoch from now()) / 3600) * 3600), 120)
on conflict (bucket, subject, window_start) do update set hits = excluded.hits;
select tests.authenticate_as(:'a');
select throws_ok(
  format('select public.save_lift_goal(%L, 110, 5, null)', :'bench'),
  'PT429', null, 'goal saves are rate limited per user'
);
reset role;

select * from finish();
rollback;
