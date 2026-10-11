begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select tests.create_user('hold_owner') as owner \gset
select tests.add_session(:'owner', now() - interval '1 hour') as s \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as running from public.exercises where key = 'running' \gset

select has_column('public', 'exercises', 'measure', 'exercises have a measure');
select col_default_is('public', 'exercises', 'measure', 'reps'::public.exercise_measure, 'an exercise measures reps by default');
select is(
  (select count(*)::int from public.exercises where modality = 'cardio' and measure <> 'reps'),
  0,
  'no cardio activity has a hold measure'
);
select throws_ok(
  format($$update public.exercises set measure = 'time' where id = %L$$, :'running'),
  '23514', 'new row for relation "exercises" violates check constraint "exercise_measure_is_a_lift_measure"',
  'only a lift can measure time or distance'
);

create function tests.add_hold_set(
  at_position int,
  weight numeric,
  load numeric,
  duration int,
  distance numeric,
  effort_type public.effort_input_type default null,
  effort_value numeric default null,
  warmup boolean default false
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, duration_s, distance_m,
     effort_input_type, effort_value, is_warmup, rir_source, effective_reps, xp_awarded)
  select gen_random_uuid(), s.id, s.user_id, e.id, add_hold_set.at_position, add_hold_set.weight, add_hold_set.load,
         add_hold_set.duration, add_hold_set.distance, add_hold_set.effort_type, add_hold_set.effort_value,
         add_hold_set.warmup, 'default', 3, 495
  from public.sessions s, public.exercises e
  where s.user_id = (select p.id from public.profiles p where p.username = 'hold_owner')
    and e.key = case when add_hold_set.duration is null then 'farmers_carry' else 'plate_pinch' end;
$$;

select lives_ok($$select tests.add_hold_set(0, 0, 80, 45, null)$$, 'a timed hold stores its load and duration');
select lives_ok($$select tests.add_hold_set(1, 32, 32, null, 40)$$, 'a carry stores its load and distance');
select lives_ok($$select tests.add_hold_set(2, 20, 20, 60, null, 'level', 0)$$, 'a hold takes an effort level');
select lives_ok($$select tests.add_hold_set(3, 20, 20, 1, null)$$, 'a hold may last one second');
select throws_ok(
  $$select tests.add_hold_set(4, 20, 20, 60, 40)$$,
  '23514', 'new row for relation "sets" violates check constraint "set_is_lift_cardio_or_hold"',
  'a hold has a duration or a distance, not both'
);
select throws_ok(
  $$select tests.add_hold_set(4, 20, 20, null, null)$$,
  '23514', 'new row for relation "sets" violates check constraint "set_is_lift_cardio_or_hold"',
  'a hold needs a duration or a distance'
);
select throws_ok(
  $$select tests.add_hold_set(4, 20, 20, 3601, null)$$,
  '23514', 'new row for relation "sets" violates check constraint "set_is_lift_cardio_or_hold"',
  'a hold lasts at most an hour'
);
select throws_ok(
  $$select tests.add_hold_set(4, 20, 20, null, 10001)$$,
  '23514', 'new row for relation "sets" violates check constraint "set_is_lift_cardio_or_hold"',
  'a carry covers at most 10 km'
);
select throws_ok(
  $$select tests.add_hold_set(4, 20, 20, 60, null, 'rir', 2)$$,
  '23514', 'new row for relation "sets" violates check constraint "effort_matches_set_kind"',
  'a hold takes no RIR'
);
select throws_ok(
  $$select tests.add_hold_set(4, 20, 20, 60, null, null, null, true)$$,
  '23514', 'new row for relation "sets" violates check constraint "set_is_lift_cardio_or_hold"',
  'a hold is never a warm-up'
);

select * from finish();
rollback;
