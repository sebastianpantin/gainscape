begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select tests.create_user('measure_lock_owner') as owner \gset
select tests.add_session(:'owner', now() - interval '1 hour') as s \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as unlogged_lift from public.exercises exercise
where exercise.owner_user_id is null
  and exercise.modality = 'lift'
  and not exists (select 1 from public.sets where sets.exercise_id = exercise.id)
order by exercise.key
limit 1 \gset
select id as running from public.exercises where key = 'running' \gset
select id as swimming from public.exercises where key = 'swimming' \gset

update public.exercises set reference_pace_s_per_km = null, record_min_distance_m = null
where id in (:'running', :'swimming');

insert into public.sets
  (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir_source, effective_reps, xp_awarded)
values (gen_random_uuid(), :'s', :'owner', :'bench', 0, 60, 60, 5, 'default', 0, 0);

insert into public.sets
  (id, session_id, user_id, exercise_id, position, duration_s, counted_work_s, distance_m, rir_source, effective_reps, xp_awarded)
values (gen_random_uuid(), :'s', :'owner', :'running', 1, 1500, 1500, 5000, 'default', 0, 0);

select throws_ok(
  format($$update public.exercises set measure = 'time' where id = %L$$, :'bench'),
  '23514', null,
  'the measure of a logged exercise cannot change'
);
select lives_ok(
  format($$update public.exercises set measure = measure where id = %L$$, :'bench'),
  'rewriting the same measure of a logged exercise is allowed, as the seed does'
);
select lives_ok(
  format($$update public.exercises set measure = 'time' where id = %L$$, :'unlogged_lift'),
  'the measure of an exercise nobody logged can change'
);
select throws_ok(
  format($$update public.exercises set tracks_distance = false where id = %L$$, :'running'),
  '23514', null,
  'distance tracking cannot be turned off once a distance was logged'
);
select lives_ok(
  format($$update public.exercises set tracks_distance = true where id = %L$$, :'running'),
  'rewriting the same distance tracking is allowed'
);
select lives_ok(
  format($$update public.exercises set tracks_distance = false where id = %L$$, :'swimming'),
  'distance tracking can be turned off while no distance was logged'
);

select * from finish();
rollback;
