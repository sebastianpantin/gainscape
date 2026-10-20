begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select tests.create_user('timeline_owner') as owner \gset
select tests.create_user('timeline_stranger') as stranger \gset

create function pg_temp.set_prs(session uuid, prs jsonb)
returns void language sql as $$
  update public.sessions set summary = summary || jsonb_build_object('prs', set_prs.prs) where id = set_prs.session;
$$;

select tests.add_session(:'owner', '2026-10-01 08:00+00') as oldest \gset
select tests.add_session(:'owner', '2026-10-02 08:00+00') as double \gset
select tests.add_session(:'owner', '2026-10-03 08:00+00') as plain \gset
select tests.add_session(:'owner', '2026-10-04 08:00+00') as imported \gset
select tests.add_session(:'owner', '2026-10-05 23:30+00') as newest \gset
select pg_temp.set_prs(:'oldest', jsonb_build_array(jsonb_build_object('kind', 'rep_max', 'reps', 5)));
select pg_temp.set_prs(:'double', jsonb_build_array(
  jsonb_build_object('kind', 'rep_max', 'reps', 1),
  jsonb_build_object('kind', 'bodyweight_reps', 'reps', 12)));
select pg_temp.set_prs(:'imported', jsonb_build_array(jsonb_build_object('kind', 'rep_max', 'reps', 3)));
update public.sessions set history_only = true, local_date = '2026-10-04' where id = :'imported';
select pg_temp.set_prs(:'newest', jsonb_build_array(jsonb_build_object('kind', 'cardio', 'records', '[]'::jsonb)));
update public.sessions set local_date = '2026-10-06', timezone = 'Europe/Stockholm' where id = :'newest';

select has_function(
  'public', 'personal_record_timeline', array['timestamp with time zone', 'uuid', 'integer'],
  'personal_record_timeline exists');
select ok(
  has_function_privilege('authenticated', 'public.personal_record_timeline(timestamptz, uuid, int)', 'execute')
    and not has_function_privilege('anon', 'public.personal_record_timeline(timestamptz, uuid, int)', 'execute')
    and not has_function_privilege('public', 'public.personal_record_timeline(timestamptz, uuid, int)', 'execute'),
  'only authenticated may read the record timeline'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.personal_record_timeline(timestamptz, uuid, int)'::regprocedure),
  false,
  'personal_record_timeline runs as the caller'
);
select is(
  (select p.provolatile from pg_proc p where p.oid = 'public.personal_record_timeline(timestamptz, uuid, int)'::regprocedure),
  's',
  'personal_record_timeline is stable'
);

select tests.authenticate_as(:'owner');
select is(
  public.personal_record_timeline(null, null, 2) -> 0,
  jsonb_build_object(
    'session_id', :'newest'::uuid,
    'started_at', '2026-10-05T23:30:00+00:00'::timestamptz,
    'local_date', '2026-10-06',
    'record', jsonb_build_object('kind', 'cardio', 'records', '[]'::jsonb)),
  'the newest record comes first with its workout, start and local day'
);
select is(
  (select jsonb_agg(entry -> 'record' -> 'reps') from jsonb_array_elements(public.personal_record_timeline(null, null, 2)) entry),
  jsonb_build_array(null, 1, 12),
  'a page holds every record of its workouts in summary order, skipping workouts without records'
);
select is(
  (select jsonb_agg(entry -> 'session_id')
   from jsonb_array_elements(public.personal_record_timeline('2026-10-02 08:00+00', :'double', 2)) entry),
  jsonb_build_array(:'oldest'::uuid),
  'the next page starts after the last workout of the page before'
);
select is(
  (select jsonb_agg(distinct entry -> 'session_id')
   from jsonb_array_elements(public.personal_record_timeline(null, null, 50)) entry),
  (select jsonb_agg(distinct id) from (values (:'oldest'::uuid), (:'double'::uuid), (:'newest'::uuid)) ids(id)),
  'history-only workouts add no records'
);
select is(
  jsonb_array_length(public.personal_record_timeline(null, null, 0)),
  1,
  'a page holds at least one workout'
);
select is(
  jsonb_array_length(public.personal_record_timeline(null, null, 100000)),
  4,
  'a huge page size is clamped, not refused'
);
reset role;

select tests.authenticate_as(:'stranger');
select is(
  public.personal_record_timeline(null, null, 50),
  '[]'::jsonb,
  'a stranger reads none of the owner''s records'
);
reset role;

select * from finish();
rollback;
