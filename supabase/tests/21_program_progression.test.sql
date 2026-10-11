begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select tests.create_user('pp_owner') as owner \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select gen_random_uuid() as program \gset
select gen_random_uuid() as day \gset

insert into public.programs (id, owner_user_id, name) values (:'program', :'owner', 'Progression');
insert into public.program_days (id, program_id, position, name) values (:'day', :'program', 0, 'Day');

select col_not_null('public', 'program_day_exercises', 'progression', 'every planned exercise has a progression');
select col_default_is(
  'public', 'program_day_exercises', 'progression', 'none',
  'a planned exercise has no progression unless one is chosen'
);
select col_type_is(
  'public', 'program_day_exercises', 'increment_kg', 'numeric(5,2)',
  'the kilogram increment is stored to two decimals'
);
select col_type_is(
  'public', 'program_day_exercises', 'increment_lb', 'numeric(5,2)',
  'the pound increment is stored to two decimals'
);

insert into public.program_day_exercises (day_id, position, exercise_id, target_sets, target_reps_min, target_reps_max)
values (:'day', 0, :'squat', 5, 5, 5);
select is(
  (select row(progression, increment_kg, increment_lb)::text from public.program_day_exercises
   where day_id = :'day' and position = 0),
  row('none', null::numeric, null::numeric)::text,
  'an existing planned exercise reads as no progression with no increments'
);

select lives_ok(
  format($$update public.program_day_exercises set progression = 'fixed' where day_id = %L$$, :'day'),
  'a fixed progression needs no increments'
);
select lives_ok(
  format(
    $$update public.program_day_exercises set progression = 'linear', increment_kg = 2.5, increment_lb = 5
      where day_id = %L$$,
    :'day'
  ),
  'a linear progression with both increments is accepted'
);
select lives_ok(
  format($$update public.program_day_exercises set increment_kg = 0.25, increment_lb = 0.5 where day_id = %L$$, :'day'),
  'the smallest increments are accepted'
);
select lives_ok(
  format($$update public.program_day_exercises set increment_kg = 20, increment_lb = 45 where day_id = %L$$, :'day'),
  'the largest increments are accepted'
);

select throws_ok(
  format(
    $$update public.program_day_exercises set progression = 'double', increment_kg = null, increment_lb = null
      where day_id = %L$$,
    :'day'
  ),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "program_exercise_progression_is_known"',
  'an unknown progression is rejected'
);
select throws_ok(
  format(
    $$update public.program_day_exercises set increment_kg = null, increment_lb = null where day_id = %L$$,
    :'day'
  ),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "only_linear_progression_has_increments"',
  'a linear progression without increments is rejected'
);
select throws_ok(
  format($$update public.program_day_exercises set increment_lb = null where day_id = %L$$, :'day'),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "only_linear_progression_has_increments"',
  'a linear progression without a pound increment is rejected'
);
select throws_ok(
  format($$update public.program_day_exercises set progression = 'fixed' where day_id = %L$$, :'day'),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "only_linear_progression_has_increments"',
  'a fixed progression with increments is rejected'
);
select throws_ok(
  format(
    $$update public.program_day_exercises set progression = 'none', increment_lb = null where day_id = %L$$,
    :'day'
  ),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "only_linear_progression_has_increments"',
  'no progression with a lone kilogram increment is rejected'
);
select throws_ok(
  format($$update public.program_day_exercises set increment_kg = 0.24 where day_id = %L$$, :'day'),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "increment_kg_in_range"',
  'a kilogram increment below 0.25 is rejected'
);
select throws_ok(
  format($$update public.program_day_exercises set increment_kg = 20.01 where day_id = %L$$, :'day'),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "increment_kg_in_range"',
  'a kilogram increment above 20 is rejected'
);
select throws_ok(
  format($$update public.program_day_exercises set increment_lb = 0.49 where day_id = %L$$, :'day'),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "increment_lb_in_range"',
  'a pound increment below 0.5 is rejected'
);
select throws_ok(
  format($$update public.program_day_exercises set increment_lb = 45.01 where day_id = %L$$, :'day'),
  '23514',
  'new row for relation "program_day_exercises" violates check constraint "increment_lb_in_range"',
  'a pound increment above 45 is rejected'
);

select is(
  (select row(progression, increment_kg, increment_lb)::text from public.program_day_exercises
   where day_id = :'day' and position = 0),
  row('linear', 20.00::numeric(5,2), 45.00::numeric(5,2))::text,
  'rejected updates leave the planned exercise as it was'
);

select * from finish();
rollback;
