begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select tests.create_user('timed_programmer') as owner \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as hang from public.exercises where key = 'dead_hang' \gset
select id as carry from public.exercises where key = 'farmers_carry' \gset
select id as rehab from public.programs where key = 'golfers_elbow_rehab' \gset

create function tests.one_slot_program(slot jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', gen_random_uuid(),
    'name', 'Rehab plan',
    'days', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'Daily',
      'exercises', jsonb_build_array(jsonb_build_object('targetSets', 5) || one_slot_program.slot)
    ))
  );
$$;

select tests.one_slot_program(jsonb_build_object('exerciseId', :'hang', 'targetDurationS', 45)) as timed \gset
select tests.one_slot_program(jsonb_build_object('exerciseId', :'hang', 'targetDurationS', 3601)) as too_long \gset
select tests.one_slot_program(
  jsonb_build_object('exerciseId', :'hang', 'targetDurationS', 45, 'progression', 'fixed')
) as progressing \gset
select tests.one_slot_program(
  jsonb_build_object('exerciseId', :'bench', 'targetDurationS', 45)
) as timed_lift \gset
select tests.one_slot_program(jsonb_build_object('exerciseId', :'carry', 'targetDurationS', 45)) as timed_carry \gset

select is(
  (select category from public.programs where key = 'golfers_elbow_rehab'),
  'rehab',
  'a rehab template carries the rehab category'
);

select tests.authenticate_as(:'owner');

select lives_ok(
  format($$select public.save_program(%L::jsonb)$$, :'timed'),
  'a timed hold can be planned with a duration'
);
select is(
  (select array[x.target_duration_s, x.target_reps_min, x.target_reps_max]
   from public.program_day_exercises x
   join public.program_days d on d.id = x.day_id
   where d.program_id = (:'timed'::jsonb ->> 'id')::uuid),
  array[45, null, null]::int[],
  'a planned timed hold stores its duration and no reps'
);
select throws_ok(
  format($$select public.save_program(%L::jsonb)$$, :'too_long'),
  'P0001', 'invalid_program',
  'a planned hold lasts at most an hour'
);
select throws_ok(
  format($$select public.save_program(%L::jsonb)$$, :'progressing'),
  'P0001', 'invalid_program',
  'a planned hold has no progression'
);
select throws_ok(
  format($$select public.save_program(%L::jsonb)$$, :'timed_lift'),
  'P0001', 'invalid_program',
  'a rep lift cannot be planned with a duration'
);
select throws_ok(
  format($$select public.save_program(%L::jsonb)$$, :'timed_carry'),
  'P0001', 'invalid_program',
  'a carry cannot be planned with a duration'
);

select public.copy_program(:'rehab', '00000000-0000-4000-8000-0000000000e1');
select is(
  (select array_agg(x.target_duration_s order by x.position)
   from public.program_day_exercises x
   join public.program_days d on d.id = x.day_id
   where d.program_id = '00000000-0000-4000-8000-0000000000e1'),
  (select array_agg(x.target_duration_s order by x.position)
   from public.program_day_exercises x
   join public.program_days d on d.id = x.day_id
   where d.program_id = :'rehab'),
  'copying a program keeps the duration of its timed holds'
);
select throws_ok(
  $$select public.publish_program('00000000-0000-4000-8000-0000000000e1')$$,
  'P0001', 'program_has_holds',
  'a program with a timed hold cannot be followed'
);

reset role;
select * from finish();
rollback;
