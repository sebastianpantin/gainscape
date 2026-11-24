begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select tests.create_user('ga_owner') as owner \gset
select tests.create_user('ga_stranger') as stranger \gset
select tests.add_session(:'owner', now() - interval '3 hours') as owner_session \gset
select tests.add_session(:'owner', now() - interval '2 hours') as other_owner_session \gset
select tests.add_session(:'stranger', now() - interval '3 hours') as stranger_session \gset
select tests.add_session(:'stranger', now() - interval '2 hours') as unlinked_stranger_session \gset

insert into public.garmin_activities (user_id, started_at, outcome, session_id, garmin_type)
values
  (:'owner', '2026-11-20 06:30:05+00', 'imported', :'owner_session', 'running'),
  (:'owner', '2026-11-21 06:30:05+00', 'deleted', null, 'trail_running'),
  (:'owner', '2026-11-22 06:30:05+00', 'rejected', null, null),
  (:'stranger', '2026-11-20 06:30:05+00', 'imported', :'stranger_session', 'cycling');

select has_table('public', 'garmin_activities', 'seen Garmin activities have their own table');
select policies_are(
  'public', 'garmin_activities',
  array['read own garmin activities'],
  'seen Garmin activities have only the own-rows read policy'
);
select is(
  (select array_agg(g.privilege_type::text order by g.privilege_type::text)
   from information_schema.role_table_grants g
   where g.grantee = 'authenticated' and g.table_schema = 'public' and g.table_name = 'garmin_activities'),
  array['SELECT'],
  'authenticated may only read seen Garmin activities'
);
select ok(
  not has_table_privilege('anon', 'public.garmin_activities', 'select'),
  'anon cannot read seen Garmin activities'
);
select col_is_pk(
  'public', 'garmin_activities', array['user_id', 'started_at'],
  'a Garmin activity is identified per user by its start time'
);
select throws_ok(
  format('insert into public.garmin_activities (user_id, started_at, outcome) values (%L, %L, %L)',
         :'owner', '2026-11-23 06:30:05.25+00', 'deleted'),
  '23514',
  'new row for relation "garmin_activities" violates check constraint "garmin_activity_starts_on_a_whole_second"',
  'the start time is cut to the second'
);
select throws_ok(
  format('insert into public.garmin_activities (user_id, started_at, outcome, session_id) values (%L, %L, %L, %L)',
         :'owner', '2026-11-23 06:30:05+00', 'deleted', :'other_owner_session'),
  '23514',
  'new row for relation "garmin_activities" violates check constraint "only_an_imported_garmin_activity_has_a_session"',
  'only an imported Garmin activity links a Session'
);
select throws_ok(
  format('insert into public.garmin_activities (user_id, started_at, outcome, garmin_type) values (%L, %L, %L, %L)',
         :'owner', '2026-11-23 06:30:05+00', 'deleted', 'Trail Run'),
  '23514',
  'new row for relation "garmin_activities" violates check constraint "garmin_activity_type_format"',
  'the Garmin type keeps the catalog key format'
);
select throws_ok(
  format('insert into public.garmin_activities (user_id, started_at, outcome, session_id) values (%L, %L, %L, %L)',
         :'owner', '2026-11-23 06:30:05+00', 'imported', :'unlinked_stranger_session'),
  '23503', null,
  'a Garmin activity cannot link another user''s Session'
);
select throws_ok(
  format('insert into public.garmin_activities (user_id, started_at, outcome, session_id) values (%L, %L, %L, %L)',
         :'owner', '2026-11-23 06:30:05+00', 'imported', :'owner_session'),
  '23505', null,
  'a Session links at most one Garmin activity'
);
select results_eq(
  $$select max_hits, window_seconds from private.rate_limit_rules where bucket = 'garmin_import_day'$$,
  $$values (500, 86400)$$,
  'Import is capped at 500 activities a day'
);

select tests.authenticate_as(:'owner');
select is(
  (select array_agg(g.outcome::text order by g.started_at) from public.garmin_activities g),
  array['imported', 'deleted', 'rejected'],
  'a user reads their own seen Garmin activities and nobody else''s'
);
select throws_ok(
  format('insert into public.garmin_activities (user_id, started_at, outcome) values (%L, %L, %L)',
         :'owner', '2026-11-23 06:30:05+00', 'deleted'),
  '42501', 'permission denied for table garmin_activities',
  'a signed-in user cannot add a seen Garmin activity'
);
select throws_ok(
  $$update public.garmin_activities set outcome = 'deleted'$$,
  '42501', 'permission denied for table garmin_activities',
  'a signed-in user cannot change a seen Garmin activity'
);
select throws_ok(
  $$delete from public.garmin_activities$$,
  '42501', 'permission denied for table garmin_activities',
  'a signed-in user cannot forget a seen Garmin activity'
);
reset role;

delete from public.sessions where id = :'stranger_session';
select results_eq(
  format('select outcome::text, session_id from public.garmin_activities where user_id = %L', :'stranger'),
  $$values ('imported'::text, null::uuid)$$,
  'a Session removed from under an import leaves the Garmin activity seen'
);
select is(
  (select count(*)::int from public.garmin_activities where user_id = :'owner' and session_id = :'owner_session'),
  1,
  'removing one user''s Session leaves another user''s link alone'
);

select tests.authenticate_as(:'owner');
select lives_ok($$select public.reset_account_data('RESET')$$, 'the owner resets their data');
reset role;
select is(
  (select count(*)::int from public.garmin_activities where user_id = :'owner'),
  0,
  'a data reset forgets the caller''s seen Garmin activities'
);
select is(
  (select count(*)::int from public.garmin_activities where user_id = :'stranger'),
  1,
  'a data reset leaves another user''s seen Garmin activities'
);

delete from auth.users where id = :'stranger';
select is(
  (select count(*)::int from public.garmin_activities where user_id = :'stranger'),
  0,
  'deleting an account removes its seen Garmin activities'
);

select * from finish();
rollback;
