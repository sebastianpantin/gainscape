begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select tests.create_user('measure_owner') as owner \gset
select tests.add_session(:'owner', now() - interval '1 hour') as s \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as pinch from public.exercises where key = 'plate_pinch' \gset
select id as carry from public.exercises where key = 'farmers_carry' \gset
select id as running from public.exercises where key = 'running' \gset

create function tests.add_measured_set(exercise uuid, at_position int, reps int, duration int, distance numeric)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, duration_s, distance_m,
     rir_source, effective_reps, xp_awarded)
  select gen_random_uuid(), s.id, s.user_id, add_measured_set.exercise, add_measured_set.at_position, 20, 20,
         add_measured_set.reps, add_measured_set.duration, add_measured_set.distance, 'default', 0, 0
  from public.sessions s
  where s.user_id = (select p.id from public.profiles p where p.username = 'measure_owner');
$$;

select lives_ok(format($$select tests.add_measured_set(%L, 0, null, 45, null)$$, :'pinch'), 'a timed hold on a timed exercise');
select lives_ok(format($$select tests.add_measured_set(%L, 1, null, null, 40)$$, :'carry'), 'a carry on a distance exercise');
select lives_ok(format($$select tests.add_measured_set(%L, 2, 5, null, null)$$, :'bench'), 'a rep set on a rep exercise');
select throws_ok(
  format($$select tests.add_measured_set(%L, 3, null, 45, null)$$, :'bench'),
  '23514', 'set_measure_mismatch',
  'a hold cannot be logged on a rep exercise'
);
select throws_ok(
  format($$select tests.add_measured_set(%L, 4, null, 45, null)$$, :'carry'),
  '23514', 'set_measure_mismatch',
  'a timed hold cannot be logged on a distance exercise'
);
select throws_ok(
  format($$select tests.add_measured_set(%L, 5, null, null, 40)$$, :'pinch'),
  '23514', 'set_measure_mismatch',
  'a carry cannot be logged on a timed exercise'
);
select throws_ok(
  format($$select tests.add_measured_set(%L, 6, 5, null, null)$$, :'pinch'),
  '23514', 'set_measure_mismatch',
  'a rep set cannot be logged on a hold exercise'
);
select throws_ok(
  format($$update public.sets set exercise_id = %L where exercise_id = %L$$, :'carry', :'pinch'),
  '23514', 'set_measure_mismatch',
  'moving a hold onto an exercise of another measure is refused'
);

select * from finish();
rollback;
