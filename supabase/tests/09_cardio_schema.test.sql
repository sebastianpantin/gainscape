begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select tests.create_user('cs_owner') as owner \gset
select tests.add_session(:'owner', now() - interval '1 hour') as s \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as running from public.exercises where key = 'running' \gset
select id as sprints from public.exercises where key = 'sprint_intervals' \gset
select id as endurance from public.skills where key = 'endurance' \gset
select id as chest from public.skills where key = 'chest' \gset

create function tests.add_cardio_set(
  exercise uuid,
  at_position int,
  duration_s int,
  effort_type public.effort_input_type default null,
  effort_value numeric default null,
  rounds int default null,
  work_s int default null,
  rest_s int default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, duration_s, interval_rounds, interval_work_s, interval_rest_s,
     counted_work_s, effort_input_type, effort_value, rir_source, effective_reps, xp_awarded)
  select gen_random_uuid(), s.id, s.user_id, add_cardio_set.exercise, add_cardio_set.at_position,
         add_cardio_set.duration_s, add_cardio_set.rounds, add_cardio_set.work_s, add_cardio_set.rest_s,
         coalesce(add_cardio_set.rounds * add_cardio_set.work_s, add_cardio_set.duration_s),
         add_cardio_set.effort_type, add_cardio_set.effort_value, 'default', 0, 0
  from public.sessions s
  where s.user_id = (select p.id from public.profiles p where p.username = 'cs_owner');
$$;

create function tests.add_cross_modality_exercise(skill uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  exercise_id uuid := gen_random_uuid();
begin
  insert into public.exercises (id, name, load_type, equipment, owner_user_id)
  values (exercise_id, 'Cross modality lift', 'external', 'other', (select p.id from public.profiles p where p.username = 'cs_owner'));
  insert into public.exercise_skills (exercise_id, skill_id, share_bp) values (exercise_id, add_cross_modality_exercise.skill, 10000);
  set constraints all immediate;
end;
$$;

select throws_ok(
  format($$insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, duration_s, counted_work_s,
     rir_source, effective_reps, xp_awarded)
    values (gen_random_uuid(), %L, %L, %L, 0, 60, 60, 5, 600, 600, 'default', 5, 0)$$, :'s', :'owner', :'bench'),
  '23514', 'new row for relation "sets" violates check constraint "set_is_lift_cardio_or_hold"', 'a set row cannot be both a lift and a cardio bout'
);
select throws_ok(
  format($$insert into public.sets
    (id, session_id, user_id, exercise_id, position, rir_source, effective_reps, xp_awarded)
    values (gen_random_uuid(), %L, %L, %L, 0, 'default', 0, 0)$$, :'s', :'owner', :'running'),
  '23514', 'new row for relation "sets" violates check constraint "set_is_lift_cardio_or_hold"', 'a set row must be a lift or a cardio bout'
);
select throws_ok(
  format($$select tests.add_cardio_set(%L, 0, 600, 'rir', 2)$$, :'running'),
  '23514', 'new row for relation "sets" violates check constraint "effort_matches_set_kind"', 'a cardio row cannot carry a rir effort'
);
select throws_ok(
  format($$insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, effort_input_type, effort_value,
     rir_source, effective_reps, xp_awarded)
    values (gen_random_uuid(), %L, %L, %L, 0, 60, 60, 5, 'cardio', 2, 'logged', 5, 0)$$, :'s', :'owner', :'bench'),
  '23514', 'new row for relation "sets" violates check constraint "effort_matches_set_kind"', 'a lift row cannot carry a cardio effort'
);
select throws_ok(
  format($$select tests.add_cardio_set(%L, 0, 600, 'cardio', 5)$$, :'running'),
  '23514', 'new row for relation "sets" violates check constraint "effort_matches_set_kind"', 'a cardio effort value is between 1 and 4'
);
select throws_ok(
  format($$select tests.add_cardio_set(%L, 0, 30)$$, :'running'),
  '23514', 'new row for relation "sets" violates check constraint "cardio_duration_within_bounds"', 'a steady bout lasts at least 60 seconds'
);
select throws_ok(
  format($$select tests.add_cardio_set(%L, 0, 14401)$$, :'running'),
  '23514', 'new row for relation "sets" violates check constraint "cardio_duration_within_bounds"', 'a steady bout lasts at most 4 hours'
);
select throws_ok(
  format($$select tests.add_cardio_set(%L, 0, 100, null, null, 3, 20)$$, :'sprints'),
  '23514', 'new row for relation "sets" violates check constraint "interval_columns_set_together"', 'interval columns are all set or all null'
);
select throws_ok(
  format($$select tests.add_cardio_set(%L, 0, 100, null, null, 3, 20, 10)$$, :'sprints'),
  '23514', 'new row for relation "sets" violates check constraint "cardio_duration_within_bounds"', 'an interval bout duration equals its derived duration'
);
select throws_ok(
  format($$select tests.add_cardio_set(%L, 0, 505, null, null, 101, 5, 0)$$, :'sprints'),
  '23514', 'new row for relation "sets" violates check constraint "sets_interval_rounds_check"', 'an interval bout has at most 100 rounds'
);
select lives_ok(
  format($$select tests.add_cardio_set(%L, 0, 5, 'cardio', 4, 1, 5, 0)$$, :'sprints'),
  'a single 5-second sprint is a valid interval bout'
);
select lives_ok(
  format($$select tests.add_cardio_set(%L, 1, 1800, 'cardio', 2)$$, :'running'),
  'a 30-minute steady bout with a moderate effort is valid'
);
select throws_ok(
  format($$insert into public.sets
    (id, session_id, user_id, exercise_id, position, duration_s, distance_m, counted_work_s, rir_source, effective_reps, xp_awarded)
    values (gen_random_uuid(), %L, %L, %L, 2, 1800, 0.5, 1800, 'default', 0, 0)$$, :'s', :'owner', :'running'),
  '23514', 'new row for relation "sets" violates check constraint "sets_distance_m_check"', 'a distance is at least 1 m'
);

select throws_ok(
  format($$select tests.add_cross_modality_exercise(%L)$$, :'endurance'),
  '23514', null, 'a lift exercise cannot share XP with a cardio skill, checked at commit'
);
select lives_ok(
  format($$select tests.add_cross_modality_exercise(%L)$$, :'chest'),
  'a lift exercise shares XP with a lift skill'
);

select throws_ok(
  format($$update public.exercises set modality = 'cardio', load_type = null where id = %L$$, :'bench'),
  '23514', null, 'an exercise modality cannot change'
);
select throws_ok(
  format($$update public.skills set modality = 'cardio' where id = %L$$, :'chest'),
  '23514', null, 'a skill modality cannot change'
);
select lives_ok(
  format($$update public.exercises set modality = 'cardio', name = name where id = %L$$, :'running'),
  'a same-value exercise modality update passes'
);
select lives_ok(
  format($$update public.skills set modality = 'cardio' where id = %L$$, :'endurance'),
  'a same-value skill modality update passes'
);
select throws_ok(
  format($$update public.exercises set load_type = 'external' where id = %L$$, :'running'),
  '23514', null, 'a cardio exercise has no load type'
);

select throws_ok(
  format($$update public.profile_private set effort_input_mode = 'cardio' where user_id = %L$$, :'owner'),
  '23514', null, 'the lift effort input mode is never cardio'
);

select * from finish();
rollback;
