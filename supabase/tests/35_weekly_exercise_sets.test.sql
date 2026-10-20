begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select tests.create_user('weeks_owner') as owner \gset
select tests.create_user('weeks_stranger') as stranger \gset

select date_trunc('week', now() at time zone 'UTC')::date as monday \gset

create function pg_temp.add_week_set(session uuid, owner uuid, exercise_key text, warmup boolean)
returns void language sql as $$
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, is_warmup, rir_source, effective_reps, xp_awarded)
  select gen_random_uuid(), add_week_set.session, add_week_set.owner, e.id,
         (select count(*)::int from public.sets x where x.session_id = add_week_set.session),
         60, 60, 5, add_week_set.warmup, 'default', 0, 0
  from public.exercises e where e.key = add_week_set.exercise_key;
$$;

select e.id as bench from public.exercises e where e.key = 'barbell_bench_press' \gset
select e.id as squat from public.exercises e where e.key = 'back_squat' \gset

create function pg_temp.week_session(owner uuid, monday date, weeks_ago int)
returns uuid language sql as $$
  select tests.add_session(week_session.owner, ((week_session.monday - 7 * week_session.weeks_ago) + time '08:00') at time zone 'UTC');
$$;

select pg_temp.week_session(:'owner', :'monday', 0) as this_week \gset
select pg_temp.week_session(:'owner', :'monday', 2) as two_weeks_ago \gset
select pg_temp.week_session(:'owner', :'monday', 2) as imported \gset
select pg_temp.week_session(:'owner', :'monday', 12) as too_old \gset
update public.sessions set history_only = true where id = :'imported';
select pg_temp.add_week_set(:'this_week', :'owner', 'barbell_bench_press', false);
select pg_temp.add_week_set(:'this_week', :'owner', 'barbell_bench_press', false);
select pg_temp.add_week_set(:'this_week', :'owner', 'barbell_bench_press', true);
select pg_temp.add_week_set(:'this_week', :'owner', 'back_squat', false);
select pg_temp.add_week_set(:'two_weeks_ago', :'owner', 'barbell_bench_press', false);
select pg_temp.add_week_set(:'imported', :'owner', 'barbell_bench_press', false);
select pg_temp.add_week_set(:'too_old', :'owner', 'barbell_bench_press', false);

select has_function('public', 'weekly_exercise_sets', array['integer'], 'weekly_exercise_sets exists');
select ok(
  has_function_privilege('authenticated', 'public.weekly_exercise_sets(integer)', 'execute')
    and not has_function_privilege('anon', 'public.weekly_exercise_sets(integer)', 'execute')
    and not has_function_privilege('public', 'public.weekly_exercise_sets(integer)', 'execute'),
  'only authenticated may read weekly exercise sets'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.weekly_exercise_sets(integer)'::regprocedure),
  false,
  'weekly_exercise_sets runs as the caller'
);
select is(
  (select p.provolatile from pg_proc p where p.oid = 'public.weekly_exercise_sets(integer)'::regprocedure),
  's',
  'weekly_exercise_sets is stable'
);
select is(
  (select p.proconfig from pg_proc p where p.oid = 'public.weekly_exercise_sets(integer)'::regprocedure),
  array['search_path=""'],
  'weekly_exercise_sets pins an empty search_path'
);

select tests.authenticate_as(:'owner');
select is(
  public.weekly_exercise_sets(12),
  jsonb_build_array(
    jsonb_build_object('week_start', :'monday'::date - 14, 'exercise_id', :'bench', 'sets', 2),
    jsonb_build_object('week_start', :'monday'::date, 'exercise_id', least(:'bench', :'squat'), 'sets', case when :'bench' < :'squat' then 2 else 1 end),
    jsonb_build_object('week_start', :'monday'::date, 'exercise_id', greatest(:'bench', :'squat'), 'sets', case when :'bench' < :'squat' then 1 else 2 end)),
  'working sets per exercise per Monday week, oldest first, with history-only workouts and without warm-ups or older weeks'
);
select is(
  public.weekly_exercise_sets(1),
  public.weekly_exercise_sets(12) - 0,
  'one week reads only the current week'
);
select is(
  public.weekly_exercise_sets(0),
  public.weekly_exercise_sets(1),
  'fewer than one week reads the current week'
);
select is(
  jsonb_array_length(public.weekly_exercise_sets(1000)),
  4,
  'more than 52 weeks reads 52 weeks'
);
reset role;

select tests.authenticate_as(:'stranger');
select is(
  public.weekly_exercise_sets(52),
  '[]'::jsonb,
  'a stranger reads none of the owner''s sets'
);
reset role;

select * from finish();
rollback;
