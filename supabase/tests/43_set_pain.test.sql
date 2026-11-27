begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select tests.create_user('pain_owner') as owner \gset
select tests.add_session(:'owner', now() - interval '1 hour') as s \gset
select id as curl from public.exercises where key = 'eccentric_wrist_curl' \gset

create function tests.add_lift_set_with_pain(session uuid, owner uuid, exercise uuid, at_position int, pain int)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir_source, effective_reps,
     xp_awarded, pain)
  values
    (gen_random_uuid(), session, owner, exercise, at_position, 5, 5, 15, 'default', 0, 0, pain);
$$;

select col_type_is('public', 'sets', 'pain', 'smallint', 'a set stores pain as a small integer');
select lives_ok(
  format('select tests.add_lift_set_with_pain(%L, %L, %L, 0, null)', :'s', :'owner', :'curl'),
  'a set may leave pain out'
);
select lives_ok(
  format('select tests.add_lift_set_with_pain(%L, %L, %L, 1, 10)', :'s', :'owner', :'curl'),
  'a set may carry pain 10'
);
select throws_ok(
  format('select tests.add_lift_set_with_pain(%L, %L, %L, 2, 11)', :'s', :'owner', :'curl'),
  '23514', 'new row for relation "sets" violates check constraint "set_pain_within_bounds"',
  'a set refuses pain above 10'
);

select * from finish();
rollback;
