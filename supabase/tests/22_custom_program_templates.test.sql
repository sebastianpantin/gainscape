begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

create function pg_temp.fill_bucket(bucket_name text, subject uuid) returns void language sql as $$
  insert into private.rate_limit_hits (bucket, subject, window_start, hits)
  select r.bucket, fill_bucket.subject,
         to_timestamp(floor(extract(epoch from now()) / r.window_seconds) * r.window_seconds), r.max_hits
  from private.rate_limit_rules r where r.bucket = fill_bucket.bucket_name
  on conflict (bucket, subject, window_start) do update set hits = excluded.hits;
$$;

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

create function pg_temp.squat_enrollment(template_key text) returns jsonb language sql as $$
  select jsonb_build_object(
    'templateKey', squat_enrollment.template_key,
    'templateVersion', 1,
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

select has_column('public', 'program_templates', 'owner_user_id', 'a template can have an owner');
select has_column('public', 'program_templates', 'source_program_id', 'a snapshot remembers its program');
select col_not_null('public', 'program_templates', 'created_at', 'every template has a creation time');
select fk_ok(
  'public', 'program_templates', 'owner_user_id', 'public', 'profiles', 'id',
  'a snapshot belongs to a profile'
);
select fk_ok(
  'public', 'program_templates', 'source_program_id', 'public', 'programs', 'id',
  'a snapshot points at the program it was published from'
);
select is(
  (select count(*)::int from public.program_templates where key !~ '^custom_' and owner_user_id is not null),
  0,
  'the seeded catalog templates keep no owner'
);
select results_eq(
  $$select max_hits, window_seconds from private.rate_limit_rules where bucket = 'program_publish_hour'$$,
  $$values (20, 3600)$$,
  'publishing is limited to 20 new snapshots an hour'
);

select tests.create_user('cpt_alpha') as a \gset
select tests.create_user('cpt_bravo') as b \gset
select tests.create_user('cpt_charlie') as c \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select pg_temp.add_program(:'a', :'squat') as program_a \gset
select pg_temp.add_program(:'c', :'squat') as program_c \gset
select 'custom_' || replace(:'program_a', '-', '') as key_a \gset

select throws_ok(
  format(
    $$insert into public.program_templates (key, version, name, definition, owner_user_id)
      values ('catalog_like', 1, 'Catalog like', '{}', %L)$$,
    :'a'
  ),
  '23514', null, 'a catalog-style key cannot have an owner'
);
select throws_ok(
  $$insert into public.program_templates (key, version, name, definition) values ('custom_orphan', 1, 'Orphan', '{}')$$,
  '23514', null, 'a custom_ key needs an owner'
);

select ok(not has_function_privilege('anon', 'public.publish_program(uuid)', 'execute'), 'anon cannot publish');
select ok(has_function_privilege('authenticated', 'public.publish_program(uuid)', 'execute'), 'a user can publish');
select ok(not has_table_privilege('anon', 'public.program_templates', 'select'), 'anon still reads no templates');

select tests.authenticate_as(:'a');
select is(
  public.publish_program(:'program_a'),
  jsonb_build_object('key', :'key_a', 'version', 1),
  'the owner publishes their program as version 1 of its custom key'
);
select is(
  (select count(*)::int from public.program_templates where key = :'key_a'),
  1,
  'the owner reads their snapshot'
);
select ok(
  (select count(*) from public.program_templates where key = 'madcow_5x5') = 2,
  'the owner still reads the catalog templates'
);
select lives_ok(
  format('select public.enroll_program(pg_temp.squat_enrollment(%L))', :'key_a'),
  'the owner follows their own snapshot'
);
reset role;

select is(
  (select row(owner_user_id, source_program_id)::text from public.program_templates where key = :'key_a'),
  row(:'a'::uuid, :'program_a'::uuid)::text,
  'the snapshot records its owner and program'
);

select tests.authenticate_as(:'b');
select is(
  (select count(*)::int from public.program_templates where key = :'key_a'),
  0,
  'another user cannot read the snapshot'
);
select ok(
  (select count(*) from public.program_templates where key = 'madcow_5x5') = 2,
  'another user still reads the catalog templates'
);
select throws_ok(
  format('select public.enroll_program(pg_temp.squat_enrollment(%L))', :'key_a'),
  'P0001', 'unknown_template', 'another user cannot follow the snapshot'
);
select throws_ok(
  format('select public.publish_program(%L)', :'program_a'),
  'P0001', 'program_not_found', 'another user cannot publish the program'
);
reset role;

select pg_temp.fill_bucket('program_publish_hour', :'c');
select tests.authenticate_as(:'c');
select throws_ok(
  format('select public.publish_program(%L)', :'program_c'),
  'PT429', 'rate_limited', 'a new snapshot over the hourly limit is refused'
);
reset role;

delete from auth.users where id = :'a';
select is(
  (select count(*)::int from public.program_templates where key = :'key_a'),
  0,
  'deleting the account deletes its snapshots, even one it follows'
);

select * from finish();
rollback;
