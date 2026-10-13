begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.add_program(owner uuid, squat uuid) returns uuid language plpgsql as $$
declare
  program_id uuid := gen_random_uuid();
  day_id uuid := gen_random_uuid();
begin
  insert into public.programs (id, owner_user_id, name) values (program_id, add_program.owner, 'Squat 5x5');
  insert into public.program_days (id, program_id, position, name) values (day_id, program_id, 0, 'Day 1');
  insert into public.program_day_exercises
    (day_id, position, exercise_id, target_sets, target_reps_min, target_reps_max, progression, increment_kg, increment_lb)
  values (day_id, 0, add_program.squat, 5, 5, 5, 'linear', 2.5, 5);
  return program_id;
end;
$$;

create function pg_temp.change_increment(program_id uuid, increment_kg numeric) returns void language sql as $$
  update public.program_day_exercises x set increment_kg = change_increment.increment_kg
  from public.program_days d
  where d.id = x.day_id and d.program_id = change_increment.program_id;
$$;

create function pg_temp.squat_enrollment(template_key text, template_version int) returns jsonb language sql as $$
  select jsonb_build_object(
    'templateKey', squat_enrollment.template_key,
    'templateVersion', squat_enrollment.template_version,
    'unit', 'kg',
    'options', '{}'::jsonb,
    'bindings', '{}'::jsonb,
    'inputs', jsonb_build_object(
      'x_' || replace((select id from public.exercises where key = 'back_squat')::text, '-', ''),
      '{"workingWeight": 100}'::jsonb
    ),
    'rounding', '{"increment": 2.5, "mode": "nearest", "barWeight": 20}'::jsonb
  );
$$;

create function pg_temp.versions(template_key text) returns int[] language sql as $$
  select coalesce(array_agg(t.version order by t.version), '{}')
  from public.program_templates t where t.key = versions.template_key;
$$;

select tests.create_user('ptc_alpha') as a \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select pg_temp.add_program(:'a', :'squat') as followed \gset
select pg_temp.add_program(:'a', :'squat') as other \gset
select pg_temp.add_program(:'a', :'squat') as unfollowed \gset
select 'custom_' || replace(:'followed', '-', '') as followed_key \gset
select 'custom_' || replace(:'other', '-', '') as other_key \gset
select 'custom_' || replace(:'unfollowed', '-', '') as unfollowed_key \gset

select tests.authenticate_as(:'a');
select public.publish_program(:'followed');
select public.publish_program(:'other');
select public.publish_program(:'unfollowed');
select public.enroll_program(pg_temp.squat_enrollment(:'followed_key', 1));
reset role;

select pg_temp.change_increment(:'followed', 5);
select tests.authenticate_as(:'a');
select is(
  public.publish_program(:'followed'),
  jsonb_build_object('key', :'followed_key', 'version', 2),
  'an edited program publishes version 2'
);
reset role;
select pg_temp.change_increment(:'followed', 7.5);
select tests.authenticate_as(:'a');
select is(
  public.publish_program(:'followed'),
  jsonb_build_object('key', :'followed_key', 'version', 3),
  'a second edit publishes version 3'
);
reset role;

select is(
  pg_temp.versions(:'followed_key'),
  array[1, 3],
  'publishing prunes an earlier version nobody follows and keeps the followed one'
);
select is(pg_temp.versions(:'other_key'), array[1], 'publishing leaves the snapshots of another program alone');

select pg_temp.change_increment(:'unfollowed', 5);
select tests.authenticate_as(:'a');
select public.publish_program(:'unfollowed');
reset role;
select is(pg_temp.versions(:'unfollowed_key'), array[2], 'an unfollowed program keeps only its latest version');

select tests.authenticate_as(:'a');
select lives_ok(format('select public.delete_program(%L)', :'followed'), 'the owner deletes the followed program');
select lives_ok(format('select public.delete_program(%L)', :'unfollowed'), 'the owner deletes an unfollowed program');
reset role;

select is(
  pg_temp.versions(:'followed_key'),
  array[1],
  'deleting the program keeps only the snapshot a past enrollment references'
);
select is(pg_temp.versions(:'unfollowed_key'), '{}'::int[], 'deleting an unfollowed program deletes its snapshots');

select tests.authenticate_as(:'a');
select throws_ok(
  format('select public.enroll_program(pg_temp.squat_enrollment(%L, 1))', :'followed_key'),
  'P0001', 'unknown_template', 'a snapshot of a deleted program cannot be followed again'
);
select lives_ok(
  format('select public.enroll_program(pg_temp.squat_enrollment(%L, 1))', :'other_key'),
  'a snapshot of a program that still exists can still be followed'
);
reset role;

select * from finish();
rollback;
