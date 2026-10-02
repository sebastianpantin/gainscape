begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

create function pg_temp.add_enrollment(owner uuid) returns uuid language sql as $$
  insert into public.program_enrollments
    (user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding)
  values (
    add_enrollment.owner, 'madcow_5x5', 1, 'kg',
    '{"rampStep": 0.125}',
    '{}',
    '{"squat": {"fiveRm": 100}, "bench": {"fiveRm": 80}, "row": {"fiveRm": 70}, "press": {"fiveRm": 50}, "deadlift": {"fiveRm": 140}}',
    '{"increment": 2.5, "mode": "nearest", "barWeight": 20}'
  )
  returning id;
$$;

create function pg_temp.link_session(session uuid, enrollment uuid, program_position jsonb) returns void
language plpgsql as $$
begin
  update public.sessions
  set enrollment_id = link_session.enrollment, program_position = link_session.program_position
  where id = link_session.session;
end;
$$;

create function pg_temp.add_set(
  session uuid,
  at_position int,
  ref text,
  prescribed_weight numeric,
  prescribed_reps int,
  prescribed_amrap boolean,
  prescribed_min_reps int default null
) returns uuid language plpgsql as $$
declare
  set_id uuid := gen_random_uuid();
begin
  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, effort_input_type,
     effort_value, rir_source, effective_reps, xp_awarded, prescription_ref, prescribed_weight_kg, prescribed_reps,
     prescribed_min_reps, prescribed_amrap)
  select set_id, s.id, s.user_id, (select e.id from public.exercises e where e.key = 'back_squat'), add_set.at_position,
         80, 80, 5, 'rir', 2, 'logged', 5, 0, add_set.ref, add_set.prescribed_weight, add_set.prescribed_reps,
         add_set.prescribed_min_reps, add_set.prescribed_amrap
  from public.sessions s where s.id = add_set.session;
  return set_id;
end;
$$;

create function pg_temp.facts(enrollment uuid) returns jsonb language plpgsql as $$
declare
  result jsonb;
begin
  execute 'select public.enrollment_facts($1)' into result using facts.enrollment;
  return result;
exception when undefined_function then
  return jsonb_build_object('enrollment_facts', 'missing');
end;
$$;

select has_column('public', 'sessions', 'enrollment_id', 'a session can name the enrollment it follows');
select col_type_is('public', 'sessions', 'enrollment_id', 'uuid', 'the enrollment link is a uuid');
select col_is_null('public', 'sessions', 'enrollment_id', 'a session may follow no enrollment');
select has_column('public', 'sessions', 'program_position', 'a session can name its program position');
select col_type_is('public', 'sessions', 'program_position', 'jsonb', 'the program position is jsonb');
select col_is_null('public', 'sessions', 'program_position', 'a session may have no program position');
select fk_ok(
  'public', 'sessions', array['enrollment_id', 'user_id'],
  'public', 'program_enrollments', array['id', 'user_id'],
  'a session links only to an enrollment of its own owner'
);
select is(
  (select k.confdeltype::text from pg_constraint k
   where k.conrelid = 'public.sessions'::regclass and k.contype = 'f'
     and k.confrelid = 'public.program_enrollments'::regclass),
  'n',
  'deleting the enrollment sets the link to null'
);
select is(
  (select array(
     select a.attname::text from unnest(k.confdelsetcols) as c (attnum)
     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = c.attnum
   )
   from pg_constraint k
   where k.conrelid = 'public.sessions'::regclass and k.contype = 'f'
     and k.confrelid = 'public.program_enrollments'::regclass),
  array['enrollment_id'],
  'deleting the enrollment nulls only enrollment_id and never the owner'
);
select ok(
  exists (
    select 1 from pg_index i
    where i.indrelid = 'public.sessions'::regclass
      and (select array_agg(a.attname::text order by k.ordinality)
           from unnest(i.indkey::int2[]) with ordinality as k (attnum, ordinality)
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['enrollment_id']
      and pg_get_expr(i.indpred, i.indrelid) = '(enrollment_id IS NOT NULL)'
  ),
  'linked sessions are indexed by enrollment, leaving unlinked sessions out of the index'
);

select has_column('public', 'sets', 'prescription_ref', 'a set can name the prescribed set it follows');
select col_type_is('public', 'sets', 'prescription_ref', 'text', 'the prescription ref is text');
select has_column('public', 'sets', 'prescribed_weight_kg', 'a set can snapshot its prescribed weight');
select col_type_is('public', 'sets', 'prescribed_weight_kg', 'numeric(6,2)', 'the prescribed weight matches weight_kg');
select has_column('public', 'sets', 'prescribed_reps', 'a set can snapshot its prescribed reps');
select col_type_is('public', 'sets', 'prescribed_reps', 'integer', 'the prescribed reps are an integer');
select has_column('public', 'sets', 'prescribed_min_reps', 'a set can snapshot its prescribed minimum reps');
select col_type_is('public', 'sets', 'prescribed_min_reps', 'integer', 'the prescribed minimum reps are an integer');
select has_column('public', 'sets', 'prescribed_amrap', 'a set can snapshot whether it was as many reps as possible');
select col_type_is('public', 'sets', 'prescribed_amrap', 'boolean', 'the amrap flag is a boolean');
select ok(
  exists (
    select 1 from pg_index i
    where i.indrelid = 'public.sets'::regclass
      and i.indisunique
      and (select array_agg(a.attname::text order by k.ordinality)
           from unnest(i.indkey::int2[]) with ordinality as k (attnum, ordinality)
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['session_id', 'prescription_ref']
      and pg_get_expr(i.indpred, i.indrelid) = '(prescription_ref IS NOT NULL)'
  ),
  'a prescription ref is unique within a session, and sets without a ref are left out'
);

select has_function('public', 'enrollment_facts', array['uuid'], 'enrollment_facts(enrollment_id) exists');
select is(
  (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.enrollment_facts(uuid)')),
  false,
  'enrollment_facts is security invoker, so row-level security decides what it returns'
);
select ok(
  to_regprocedure('public.enrollment_facts(uuid)') is not null
    and not has_function_privilege('anon', to_regprocedure('public.enrollment_facts(uuid)'), 'execute'),
  'anon cannot read enrollment facts'
);
select ok(
  coalesce(has_function_privilege('authenticated', to_regprocedure('public.enrollment_facts(uuid)'), 'execute'), false),
  'a signed-in user can read enrollment facts'
);

select tests.create_user('psl_alpha') as a \gset
select tests.create_user('psl_bravo') as b \gset
select tests.create_user('psl_charlie') as c \gset
select pg_temp.add_enrollment(:'a') as enrollment_a \gset
select pg_temp.add_enrollment(:'b') as enrollment_b \gset
select pg_temp.add_enrollment(:'c') as enrollment_c \gset
select tests.add_session(:'a', now() - interval '2 hours') as session_a \gset
select tests.add_session(:'a', now() - interval '1 hour') as other_session_a \gset
select tests.add_session(:'b', now() - interval '1 hour') as session_b \gset
select tests.add_session(:'c', now() - interval '1 hour') as session_c \gset

select lives_ok(
  format($$select pg_temp.link_session(%L, %L, '{"week": 1, "day": "mon"}')$$, :'session_a', :'enrollment_a'),
  'a session links to its owner''s enrollment with a position'
);
select throws_ok(
  format($$select pg_temp.link_session(%L, %L, null)$$, :'other_session_a', :'enrollment_a'),
  '23514', null, 'a linked session must carry its program position'
);
select lives_ok(
  format($$select pg_temp.link_session(%L, null, '{"week": 1, "day": "wed"}')$$, :'other_session_a'),
  'a session may keep a program position without a link, as it does once its enrollment is deleted'
);
select throws_ok(
  format($$select pg_temp.link_session(%L, %L, '{"week": 1, "day": "mon"}')$$, :'session_b', :'enrollment_a'),
  '23503', null, 'a session cannot link to another user''s enrollment'
);

select lives_ok(
  format($$select pg_temp.add_set(%L, 0, 'mon-squat:0', 80, 5, false)$$, :'session_a'),
  'a set stores a complete snapshot: ref, weight, reps and amrap'
);
select lives_ok(
  format($$select pg_temp.add_set(%L, 1, 'mon-squat:4', 100, 5, true, 5)$$, :'session_a'),
  'a set stores a snapshot with a minimum rep count'
);
select lives_ok(
  format($$select pg_temp.add_set(%L, 2, null, null, null, null)$$, :'session_a'),
  'a set may carry no snapshot at all'
);
select lives_ok(
  format($$select pg_temp.add_set(%L, 3, null, null, null, null)$$, :'session_a'),
  'two sets without a snapshot sit in one session'
);
select lives_ok(
  format($$select pg_temp.add_set(%L, 4, 'mon-squat:0', 80, 5, false)$$, :'other_session_a'),
  'the same ref may appear in another session'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 10, 'mon-squat:0', 80, 5, false)$$, :'session_a'),
  '23505', null, 'a ref appears at most once in a session'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 11, 'mon-squat:1', null, null, null)$$, :'session_a'),
  '23514', null, 'a ref without weight, reps and amrap is a partial snapshot'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 12, null, 80, 5, false)$$, :'session_a'),
  '23514', null, 'a snapshot without its ref is a partial snapshot'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 13, 'mon-squat:2', 80, 5, null)$$, :'session_a'),
  '23514', null, 'a snapshot without the amrap flag is a partial snapshot'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 14, 'mon-squat:2', 80, null, false)$$, :'session_a'),
  '23514', null, 'a snapshot without reps is a partial snapshot'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 15, null, null, null, null, 5)$$, :'session_a'),
  '23514', null, 'a minimum rep count alone is a partial snapshot'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 16, 'mon-squat:2', 2000.01, 5, false)$$, :'session_a'),
  '23514', null, 'a prescribed weight above 2000 kg is rejected'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 17, 'mon-squat:2', -1, 5, false)$$, :'session_a'),
  '23514', null, 'a negative prescribed weight is rejected'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 18, 'mon-squat:2', 80, 0, false)$$, :'session_a'),
  '23514', null, 'prescribed reps below 1 are rejected'
);
select throws_ok(
  format($$select pg_temp.add_set(%L, 19, 'mon-squat:2', 80, 101, false)$$, :'session_a'),
  '23514', null, 'prescribed reps above 100 are rejected'
);
select lives_ok(
  format($$select pg_temp.add_set(%L, 20, 'mon-squat:3', 2000, 100, false)$$, :'session_a'),
  'a 2000 kg snapshot of 100 reps is the inclusive upper bound'
);

select tests.authenticate_as(:'a');
select is(
  (select jsonb_array_length(pg_temp.facts(:'enrollment_a') -> 'sessions')),
  1,
  'the owner reads each linked session in the facts'
);
select is(
  (select pg_temp.facts(:'enrollment_a') -> 'sessions' -> 0 ->> 'id'),
  :'session_a',
  'the facts list the linked session by id'
);
select is(
  (select array(
     select s ->> 'ref'
     from jsonb_array_elements(pg_temp.facts(:'enrollment_a') -> 'sessions' -> 0 -> 'sets') s
   )),
  array['mon-squat:0', 'mon-squat:4', null, null, 'mon-squat:3'],
  'the facts list the session''s sets in position order with their refs'
);
select is(
  (select pg_temp.facts(:'enrollment_a') -> 'enrollment' ->> 'id'),
  :'enrollment_a',
  'the facts carry the enrollment itself'
);
reset role;

select tests.authenticate_as(:'b');
select is(pg_temp.facts(:'enrollment_a'), null, 'another user reads no facts of the enrollment');
reset role;

delete from public.program_enrollments where id = :'enrollment_a';
select is(
  (select count(*)::int from public.sessions where id = :'session_a'),
  1,
  'deleting an enrollment keeps its sessions'
);
select is(
  (select enrollment_id from public.sessions where id = :'session_a'),
  null,
  'deleting an enrollment sets the link of its sessions to null'
);
select is(
  (select user_id from public.sessions where id = :'session_a'),
  :'a'::uuid,
  'deleting an enrollment keeps the owner of its sessions'
);
select is(
  (select count(*)::int from public.sets where session_id = :'session_a' and prescription_ref is not null),
  3,
  'deleting an enrollment keeps the snapshots of its sessions'
);

select lives_ok(
  format($$select pg_temp.link_session(%L, %L, '{"week": 1, "day": "mon"}')$$, :'session_c', :'enrollment_c'),
  'the third user links a session to their enrollment'
);
select lives_ok(
  format($$select pg_temp.add_set(%L, 0, 'mon-squat:0', 80, 5, false)$$, :'session_c'),
  'the third user''s linked session stores a snapshot'
);
select lives_ok(
  format('delete from auth.users where id = %L', :'c'),
  'deleting an account with linked sessions succeeds'
);
select is(
  (select count(*)::int from public.sessions where user_id = :'c')
    + (select count(*)::int from public.program_enrollments where user_id = :'c'),
  0,
  'deleting the account deletes its linked sessions and its enrollments'
);

select * from finish();
rollback;
