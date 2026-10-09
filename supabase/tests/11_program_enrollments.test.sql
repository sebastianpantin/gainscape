begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

create function pg_temp.fill_bucket(bucket_name text, subject uuid) returns void language sql as $$
  insert into private.rate_limit_hits (bucket, subject, window_start, hits)
  select r.bucket, fill_bucket.subject,
         to_timestamp(floor(extract(epoch from now()) / r.window_seconds) * r.window_seconds), r.max_hits
  from private.rate_limit_rules r where r.bucket = fill_bucket.bucket_name
  on conflict (bucket, subject, window_start) do update set hits = excluded.hits;
$$;

create function pg_temp.add_enrollment(owner uuid, ended boolean default false) returns uuid language sql as $$
  insert into public.program_enrollments
    (user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding, ended_at)
  values (
    add_enrollment.owner, 'madcow_5x5', 1, 'kg',
    '{"rampStep": 0.125}',
    '{}',
    '{"squat": {"fiveRm": 100}, "bench": {"fiveRm": 80}, "row": {"fiveRm": 70}, "press": {"fiveRm": 50}, "deadlift": {"fiveRm": 140}}',
    '{"increment": 2.5, "mode": "nearest", "barWeight": 20}',
    case when add_enrollment.ended then now() end
  )
  returning id;
$$;

create function pg_temp.add_reference_event(enrollment uuid, value numeric) returns uuid language sql as $$
  insert into public.program_enrollment_events (enrollment_id, kind, payload)
  values (add_reference_event.enrollment, 'set_reference',
          jsonb_build_object('lift', 'squat', 'var', 'top', 'value', add_reference_event.value))
  returning id;
$$;

create function pg_temp.madcow_enrollment_is_valid(unit text, squat_five_rm numeric) returns boolean language sql as $$
  select private.is_valid_enrollment(
    (select t.definition from public.program_templates t where t.key = 'madcow_5x5' and t.version = 1),
    jsonb_build_object(
      'unit', madcow_enrollment_is_valid.unit,
      'options', '{}'::jsonb,
      'bindings', '{}'::jsonb,
      'inputs', jsonb_build_object(
        'squat', jsonb_build_object('fiveRm', madcow_enrollment_is_valid.squat_five_rm),
        'bench', '{"fiveRm": 80}'::jsonb, 'row', '{"fiveRm": 70}'::jsonb,
        'press', '{"fiveRm": 50}'::jsonb, 'deadlift', '{"fiveRm": 140}'::jsonb
      ),
      'rounding', '{"increment": 2.5, "mode": "nearest", "barWeight": 20}'::jsonb
    )
  );
$$;

select has_table('public', 'program_templates', 'program_templates exists');
select has_table('public', 'program_enrollments', 'program_enrollments exists');
select has_table('public', 'program_enrollment_events', 'program_enrollment_events exists');
select col_is_pk('public', 'program_templates', array['key', 'version'], 'a template is keyed by key and version');
select col_is_unique(
  'public', 'program_enrollments', array['id', 'user_id'],
  'an enrollment is unique by id and owner, for the session link in 023'
);
select ok(
  exists (
    select 1 from pg_index i
    where i.indrelid = 'public.program_enrollments'::regclass
      and (select array_agg(a.attname::text order by k.ordinality)
           from unnest(i.indkey::int2[]) with ordinality as k (attnum, ordinality)
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['user_id', 'started_at']
  ),
  'enrollments are indexed by owner and start time'
);
select fk_ok(
  'public', 'program_enrollments', array['template_key', 'template_version'],
  'public', 'program_templates', array['key', 'version'],
  'an enrollment points at one template version'
);
select results_eq(
  $$select key, version from public.program_templates where key in ('five_three_one', 'madcow_5x5') order by key, version$$,
  $$values ('five_three_one', 1), ('five_three_one', 2), ('madcow_5x5', 1), ('madcow_5x5', 2)$$,
  'the seed keeps 5/3/1 and Madcow 5x5 version 1 and ships their fixed version 2'
);
select is(
  (select count(*)::int from public.program_templates t
   where t.definition ->> 'key' is distinct from t.key or (t.definition ->> 'version')::int is distinct from t.version),
  0,
  'every template definition carries its own key and version'
);
select results_eq(
  $$select bucket, max_hits, window_seconds from private.rate_limit_rules
    where bucket in ('program_enroll_hour', 'program_adjust_hour') order by bucket$$,
  $$values ('program_adjust_hour', 60, 3600), ('program_enroll_hour', 10, 3600)$$,
  'the enroll and adjust buckets exist with their limits'
);

select tests.create_user('pe_alpha') as a \gset
select tests.create_user('pe_bravo') as b \gset
select tests.create_user('pe_charlie') as c \gset

select pg_temp.add_enrollment(:'a') as enrollment_a \gset
select pg_temp.add_enrollment(:'b') as enrollment_b \gset
select pg_temp.add_reference_event(:'enrollment_a', 95) as event_a \gset
select pg_temp.add_reference_event(:'enrollment_b', 85) as event_b \gset

select is(
  (select effective_at from public.program_enrollment_events where id = :'event_a'),
  now(),
  'an event is stamped with the server time by default'
);

select tests.authenticate_as(:'a');
select ok(
  (select count(*) from public.program_templates where key = 'madcow_5x5') = 2,
  'a signed-in user reads the templates'
);
select throws_ok(
  $$insert into public.program_templates (key, version, name, definition) values ('mine', 1, 'Mine', '{}')$$,
  '42501', null, 'a client cannot add a template'
);
select throws_ok(
  $$update public.program_templates set name = 'Renamed' where key = 'madcow_5x5'$$,
  '42501', null, 'a client cannot change a template'
);
select throws_ok(
  $$delete from public.program_templates where key = 'madcow_5x5'$$,
  '42501', null, 'a client cannot delete a template'
);
select is(
  (select array_agg(id) from public.program_enrollments),
  array[:'enrollment_a'::uuid],
  'the owner sees only their own enrollment'
);
select is(
  (select array_agg(id) from public.program_enrollment_events),
  array[:'event_a'::uuid],
  'the owner sees only the events of their own enrollment'
);
select throws_ok(
  format($$insert into public.program_enrollments
           (user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding)
           values (%L, 'madcow_5x5', 1, 'kg', '{}', '{}', '{}', '{}')$$, :'a'),
  '42501', null, 'a client cannot insert an enrollment directly'
);
select throws_ok(
  format($$update public.program_enrollments set ended_at = now() where id = %L$$, :'enrollment_a'),
  '42501', null, 'a client cannot end an enrollment directly'
);
select throws_ok(
  format($$delete from public.program_enrollments where id = %L$$, :'enrollment_a'),
  '42501', null, 'a client cannot delete an enrollment directly'
);
select throws_ok(
  format($$insert into public.program_enrollment_events (enrollment_id, kind, payload)
           values (%L, 'set_reference', '{"lift": "squat", "var": "top", "value": 100}')$$, :'enrollment_a'),
  '42501', null, 'a client cannot insert an event directly'
);
select throws_ok(
  format($$update public.program_enrollment_events set payload = '{}' where id = %L$$, :'event_a'),
  '42501', null, 'a client cannot change an event'
);
select throws_ok(
  format($$delete from public.program_enrollment_events where id = %L$$, :'event_a'),
  '42501', null, 'a client cannot delete an event'
);
reset role;

select tests.authenticate_as(:'b');
select is(
  (select count(*)::int from public.program_enrollments where id = :'enrollment_a'),
  0,
  'another user cannot see the enrollment'
);
select is(
  (select count(*)::int from public.program_enrollment_events where enrollment_id = :'enrollment_a'),
  0,
  'another user cannot see the events of the enrollment'
);
reset role;

select throws_ok(
  format('select pg_temp.add_enrollment(%L)', :'a'),
  '23505', null, 'a user has at most one active enrollment'
);
select lives_ok(
  format('select pg_temp.add_enrollment(%L, true)', :'a'),
  'an ended enrollment can sit next to the active one'
);
update public.program_enrollments set ended_at = now() where id = :'enrollment_a';
select lives_ok(
  format('select pg_temp.add_enrollment(%L)', :'a'),
  'a new enrollment can start once the active one has ended'
);
select throws_ok(
  format($$insert into public.program_enrollments
           (user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding)
           values (%L, 'madcow_5x5', 1, 'stone', '{}', '{}', '{}', '{}')$$, :'c'),
  '23514', null, 'the unit is kg or lb'
);
select throws_ok(
  format($$insert into public.program_enrollments
           (user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding)
           values (%L, 'madcow_5x5', 999, 'kg', '{}', '{}', '{}', '{}')$$, :'c'),
  '23503', null, 'an enrollment needs an existing template version'
);
select throws_ok(
  format($$insert into public.program_enrollment_events (enrollment_id, kind, payload)
           values (%L, 'reset', '{}')$$, :'enrollment_b'),
  '23514', null, 'an event kind is set_reference, skip_day or jump_to'
);
select throws_ok(
  format($$update public.program_enrollment_events set payload = '{}' where id = %L$$, :'event_b'),
  'P0001', 'program_enrollment_events_are_append_only', 'not even the server can change an event'
);

select ok(not has_function_privilege('anon', 'public.enroll_program(jsonb)', 'execute'), 'anon cannot enroll');
select ok(
  not has_function_privilege('anon', 'public.adjust_enrollment(uuid, jsonb)', 'execute'),
  'anon cannot adjust an enrollment'
);
select ok(not has_function_privilege('anon', 'public.end_enrollment(uuid)', 'execute'), 'anon cannot end an enrollment');
select ok(has_function_privilege('authenticated', 'public.enroll_program(jsonb)', 'execute'), 'a user can enroll');
select ok(
  has_function_privilege('authenticated', 'public.adjust_enrollment(uuid, jsonb)', 'execute'),
  'a user can adjust an enrollment'
);
select ok(
  has_function_privilege('authenticated', 'public.end_enrollment(uuid)', 'execute'),
  'a user can end an enrollment'
);

select pg_temp.add_enrollment(:'c', true) as enrollment_c \gset
select pg_temp.fill_bucket('program_enroll_hour', :'c');
select pg_temp.fill_bucket('program_adjust_hour', :'c');
select set_config('request.jwt.claims', json_build_object('sub', :'c', 'role', 'authenticated')::text, true);
select throws_ok(
  format('select pg_temp.add_enrollment(%L)', :'c'),
  'PT429', 'rate_limited', 'an enrollment over the hourly limit is refused'
);
select throws_ok(
  format('select pg_temp.add_reference_event(%L, 90)', :'enrollment_c'),
  'PT429', 'rate_limited', 'an adjustment over the hourly limit is refused'
);
select set_config('request.jwt.claims', '', true);
select lives_ok(
  format('select pg_temp.add_reference_event(%L, 90)', :'enrollment_c'),
  'a server-side event, with no signed-in user, is never limited'
);

delete from public.program_enrollments where id = :'enrollment_b';
select is(
  (select count(*)::int from public.program_enrollment_events where id = :'event_b'),
  0,
  'deleting an enrollment deletes its events'
);

select pg_temp.add_reference_event(:'enrollment_c', 80) as event_c \gset
delete from auth.users where id = :'c';
select is(
  (select count(*)::int from public.program_enrollments where user_id = :'c')
    + (select count(*)::int from public.program_enrollment_events where id = :'event_c'),
  0,
  'deleting the account deletes its enrollments and their events'
);

select ok(pg_temp.madcow_enrollment_is_valid('kg', 1000), 'a kg input may be 1000');
select ok(not pg_temp.madcow_enrollment_is_valid('kg', 1000.5), 'a kg input above 1000 is refused');
select ok(pg_temp.madcow_enrollment_is_valid('lb', 2205), 'an lb input may be 2205, the 1000 kg cap in pounds');
select ok(not pg_temp.madcow_enrollment_is_valid('lb', 2205.5), 'an lb input above 2205 is refused');

select * from finish();
rollback;
