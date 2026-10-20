begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select tests.create_user('days_owner') as owner \gset
select tests.create_user('days_stranger') as stranger \gset

create function pg_temp.add_day_set(session uuid, owner uuid, load numeric, reps int, warmup boolean)
returns void language sql as $$
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, is_warmup, rir_source, effective_reps, xp_awarded)
  select gen_random_uuid(), add_day_set.session, add_day_set.owner, e.id,
         (select count(*)::int from public.sets x where x.session_id = add_day_set.session),
         add_day_set.load, add_day_set.load, add_day_set.reps, add_day_set.warmup, 'default', 0, 0
  from public.exercises e where e.key = 'barbell_bench_press';
$$;

select tests.add_session(:'owner', '2026-09-30 08:00+00') as before_range \gset
select tests.add_session(:'owner', '2026-10-02 08:00+00') as first \gset
select tests.add_session(:'owner', '2026-10-02 18:00+00') as second \gset
select tests.add_session(:'owner', '2026-10-05 08:00+00') as imported \gset
select tests.add_session(:'owner', '2026-11-01 08:00+00') as after_range \gset
update public.sessions set summary = jsonb_build_object(
  'xpBySkill', jsonb_build_object('chest', 120, 'arms', 30),
  'prs', jsonb_build_array(jsonb_build_object('kind', 'e1rm'), jsonb_build_object('kind', 'weight')),
  'drops', jsonb_build_array(jsonb_build_object('itemId', 'x')))
where id = :'first';
update public.sessions set history_only = true where id = :'imported';
select pg_temp.add_day_set(:'first', :'owner', 60, 5, false);
select pg_temp.add_day_set(:'first', :'owner', 62.5, 3, false);
select pg_temp.add_day_set(:'first', :'owner', 40, 8, true);
select pg_temp.add_day_set(:'imported', :'owner', 100, 1, false);

select has_function('public', 'training_days', array['date', 'date'], 'training_days exists');
select has_index(
  'public', 'sessions', 'sessions_by_user_local_date', array['user_id', 'local_date'],
  'sessions are indexed by user and local date, so day ranges and week windows skip older workouts'
);
select ok(
  has_function_privilege('authenticated', 'public.training_days(date, date)', 'execute')
    and not has_function_privilege('anon', 'public.training_days(date, date)', 'execute')
    and not has_function_privilege('public', 'public.training_days(date, date)', 'execute'),
  'only authenticated may read training days'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.training_days(date, date)'::regprocedure),
  false,
  'training_days runs as the caller'
);
select is(
  (select p.provolatile from pg_proc p where p.oid = 'public.training_days(date, date)'::regprocedure),
  's',
  'training_days is stable'
);

select tests.authenticate_as(:'owner');
select is(
  (select jsonb_array_length(public.training_days('2026-10-01', '2026-10-31'))),
  3,
  'one entry per workout inside the range, none outside it'
);
select is(
  public.training_days('2026-10-01', '2026-10-31') -> 0,
  jsonb_build_object(
    'local_date', '2026-10-02',
    'history_only', false,
    'xp_by_skill', jsonb_build_object('chest', 120, 'arms', 30),
    'pr_count', 2,
    'drop_count', 1,
    'volume_kg', 487.5),
  'a workout carries its XP by skill, record and drop counts and working-set volume without warm-ups'
);
select is(
  public.training_days('2026-10-01', '2026-10-31') -> 1,
  jsonb_build_object(
    'local_date', '2026-10-02',
    'history_only', false,
    'xp_by_skill', '{}'::jsonb,
    'pr_count', 0,
    'drop_count', 0,
    'volume_kg', 0),
  'a workout without sets or summary counts zero'
);
select is(
  public.training_days('2026-10-01', '2026-10-31') -> 2 -> 'history_only',
  'true'::jsonb,
  'a history-only workout is flagged'
);
reset role;

select tests.authenticate_as(:'stranger');
select is(
  public.training_days('2026-01-01', '2026-12-31'),
  '[]'::jsonb,
  'a stranger reads none of the owner''s training days'
);
reset role;

select * from finish();
rollback;
