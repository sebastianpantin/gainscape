begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select tests.create_user('bw_owner') as owner \gset
select tests.create_user('bw_friend') as friend \gset
select tests.create_user('bw_stranger') as stranger \gset
select tests.make_friends(:'owner', :'friend');
update public.profile_private set timezone = 'Pacific/Kiritimati' where user_id = :'owner';

select has_table('public', 'bodyweight_entries', 'bodyweight_entries exists');
select col_is_pk('public', 'bodyweight_entries', array['user_id', 'logged_on'], 'one entry per user and day');
select ok(
  has_table_privilege('authenticated', 'public.bodyweight_entries', 'select')
    and not has_table_privilege('authenticated', 'public.bodyweight_entries', 'insert')
    and not has_table_privilege('authenticated', 'public.bodyweight_entries', 'update')
    and not has_table_privilege('authenticated', 'public.bodyweight_entries', 'delete'),
  'authenticated may only select bodyweight entries'
);
select is(
  (select array_agg(p.policyname::text order by p.policyname) from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'bodyweight_entries'),
  array['read own bodyweight entries'],
  'bodyweight entries have only the owner read policy'
);

select tests.authenticate_as(:'owner');
update public.profile_private set height_cm = 180 where user_id = :'owner';
select is((select count(*)::int from public.bodyweight_entries), 0, 'a change without bodyweight logs nothing');

update public.profile_private set bodyweight_kg = 80.5 where user_id = :'owner';
select results_eq(
  'select logged_on, bodyweight_kg from public.bodyweight_entries',
  $$values ((now() at time zone 'Pacific/Kiritimati')::date, 80.50::numeric(5, 2))$$,
  'saving bodyweight logs it on today in the owner''s time zone'
);

update public.profile_private set bodyweight_kg = 79 where user_id = :'owner';
select results_eq(
  'select bodyweight_kg from public.bodyweight_entries',
  $$values (79.00::numeric(5, 2))$$,
  'saving again on the same day replaces the entry'
);

update public.profile_private set bodyweight_kg = null where user_id = :'owner';
select is(
  (select bodyweight_kg from public.bodyweight_entries),
  79.00::numeric(5, 2),
  'clearing bodyweight keeps the logged entry'
);

select throws_ok(
  format('insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (%L, current_date - 3, 70)', :'owner'),
  '42501',
  null,
  'a client cannot insert bodyweight entries'
);
select throws_ok(
  'update public.bodyweight_entries set bodyweight_kg = 70',
  '42501',
  null,
  'a client cannot update bodyweight entries'
);
select throws_ok('delete from public.bodyweight_entries', '42501', null, 'a client cannot delete bodyweight entries');
reset role;

insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (:'owner', '2026-09-01', 81);
select throws_ok(
  format('insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (%L, %L, 19.99)', :'owner', '2026-09-02'),
  '23514',
  null,
  'a bodyweight below 20 kg is rejected'
);
select throws_ok(
  format('insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg) values (%L, %L, 400.01)', :'owner', '2026-09-02'),
  '23514',
  null,
  'a bodyweight above 400 kg is rejected'
);

delete from public.bodyweight_entries where user_id = :'owner' and logged_on <> '2026-09-01';
select tests.authenticate_as(:'owner');
update public.profile_private set bodyweight_kg = 79 where user_id = :'owner';
select is((select count(*)::int from public.bodyweight_entries), 2, 'saving an unchanged bodyweight still logs the day');
reset role;

create function pg_temp.add_bodyweight_set(session uuid, owner uuid, exercise_key text, weight numeric, effective numeric)
returns void language sql as $$
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir_source, effective_reps, xp_awarded)
  select gen_random_uuid(), add_bodyweight_set.session, add_bodyweight_set.owner, e.id,
         (select count(*)::int from public.sets x where x.session_id = add_bodyweight_set.session),
         add_bodyweight_set.weight, add_bodyweight_set.effective, 5, 'default', 5, 1
  from public.exercises e where e.key = add_bodyweight_set.exercise_key;
$$;

select tests.add_session(:'owner', '2026-09-10 07:00+00') as early \gset
select tests.add_session(:'owner', '2026-09-10 18:00+00') as late \gset
select tests.add_session(:'owner', '2026-09-12 08:00+00') as weighted \gset
select tests.add_session(:'owner', '2026-09-14 08:00+00') as external_only \gset
select tests.add_session(:'owner', '2026-09-15 08:00+00') as imported \gset
select tests.add_session(:'friend', '2026-09-10 08:00+00') as friend_session \gset
update public.sessions set history_only = true where id = :'imported';
select pg_temp.add_bodyweight_set(:'early', :'owner', 'pull_up', 0, 80);
select pg_temp.add_bodyweight_set(:'late', :'owner', 'pull_up', 0, 81);
select pg_temp.add_bodyweight_set(:'weighted', :'owner', 'weighted_pull_up', 10, 92.5);
select pg_temp.add_bodyweight_set(:'external_only', :'owner', 'barbell_bench_press', 60, 60);
select pg_temp.add_bodyweight_set(:'imported', :'owner', 'pull_up', 0, 90);
select pg_temp.add_bodyweight_set(:'friend_session', :'friend', 'pull_up', 0, 70);

select has_function('public', 'workout_bodyweights', array[]::text[], 'workout_bodyweights exists');
select ok(
  has_function_privilege('authenticated', 'public.workout_bodyweights()', 'execute')
    and not has_function_privilege('anon', 'public.workout_bodyweights()', 'execute'),
  'only authenticated may read workout bodyweights'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.workout_bodyweights()'::regprocedure),
  false,
  'workout_bodyweights runs as the caller'
);

select tests.authenticate_as(:'owner');
select results_eq(
  'select local_date, bodyweight_kg from public.workout_bodyweights()',
  $$values ('2026-09-10'::date, 81.00::numeric), ('2026-09-12'::date, 82.50::numeric)$$,
  'one row per day from the newest workout, load minus added weight, no external lifts or history-only workouts'
);
select is((select count(*)::int from public.bodyweight_entries), 2, 'the owner reads their own entries');
reset role;

select tests.authenticate_as(:'friend');
select results_eq(
  'select local_date, bodyweight_kg from public.workout_bodyweights()',
  $$values ('2026-09-10'::date, 70.00::numeric)$$,
  'a friend reads only their own workout bodyweights'
);
reset role;

select tests.authenticate_as(:'friend');
select is((select count(*)::int from public.bodyweight_entries), 0, 'a friend reads none of the owner''s entries');
reset role;

select tests.authenticate_as(:'stranger');
select is((select count(*)::int from public.bodyweight_entries), 0, 'a stranger reads none of the owner''s entries');
select is((select count(*)::int from public.workout_bodyweights()), 0, 'a stranger reads no workout bodyweights');
reset role;

delete from auth.users where id = :'owner';
select is(
  (select count(*)::int from public.bodyweight_entries where user_id = :'owner'),
  0,
  'deleting the account deletes its bodyweight entries'
);

select * from finish();
rollback;
