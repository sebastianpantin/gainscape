begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select tests.create_user('hold_programmer') as owner \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as hang from public.exercises where key = 'dead_hang' \gset
select id as carry from public.exercises where key = 'farmers_carry' \gset

create function tests.one_exercise_program(exercise uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', gen_random_uuid(),
    'name', 'Grip plan',
    'days', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'name', 'Day',
      'exercises', jsonb_build_array(jsonb_build_object(
        'exerciseId', one_exercise_program.exercise,
        'targetSets', 3,
        'targetRepsMin', 1,
        'targetRepsMax', 1
      ))
    ))
  );
$$;

select tests.one_exercise_program(:'hang') as hang_program \gset
select tests.one_exercise_program(:'carry') as carry_program \gset
select tests.one_exercise_program(:'bench') as bench_program \gset

select tests.authenticate_as(:'owner');

select throws_ok(
  format($$select public.save_program(%L::jsonb)$$, :'hang_program'),
  'P0001', 'invalid_program',
  'a timed hold cannot be planned in a program'
);
select throws_ok(
  format($$select public.save_program(%L::jsonb)$$, :'carry_program'),
  'P0001', 'invalid_program',
  'a carry cannot be planned in a program'
);
select lives_ok(
  format($$select public.save_program(%L::jsonb)$$, :'bench_program'),
  'a rep lift can still be planned'
);

reset role;
select * from finish();
rollback;
