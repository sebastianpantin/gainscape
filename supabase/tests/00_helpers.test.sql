create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
revoke all on schema tests from public, anon, authenticated;

create or replace function tests.create_user(username text, confirmed boolean default true)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    create_user.username || '@example.test',
    jsonb_build_object('username', create_user.username, 'timezone', 'UTC'),
    case when create_user.confirmed then now() end,
    now(),
    now()
  )
  returning id;
$$;

create or replace function tests.authenticate_as(user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select
    set_config('request.jwt.claims', json_build_object('sub', authenticate_as.user_id, 'role', 'authenticated')::text, true),
    set_config('role', 'authenticated', true);
$$;

create or replace function tests.add_session(user_id uuid, started_at timestamptz)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.sessions
    (id, user_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary)
  values (
    gen_random_uuid(),
    add_session.user_id,
    add_session.started_at,
    add_session.started_at,
    (add_session.started_at at time zone 'UTC')::date,
    'UTC',
    2,
    2,
    '{}'::jsonb
  )
  returning id;
$$;

create or replace function tests.add_event(
  user_id uuid,
  session_id uuid,
  event_key text,
  type public.event_type,
  payload jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
  select add_event.user_id, s.id, add_event.event_key, add_event.type, s.ended_at, add_event.payload
  from public.sessions s
  where s.id = add_event.session_id
  returning id;
$$;

create or replace function tests.make_friends(a uuid, b uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.friendships (requester_id, addressee_id, status, responded_at)
  values (make_friends.a, make_friends.b, 'accepted', now());
$$;

create or replace function tests.give_everything(owner uuid, friend uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_id uuid := tests.add_session(give_everything.owner, now() - interval '1 day');
  friend_session_id uuid := tests.add_session(give_everything.friend, now() - interval '1 day');
  set_id uuid := gen_random_uuid();
  lift uuid;
  bodyweight_lift uuid;
  skill uuid;
  custom_id uuid := gen_random_uuid();
  program_id uuid := gen_random_uuid();
  day_id uuid := gen_random_uuid();
  table_id uuid;
  roll_id uuid := gen_random_uuid();
  item uuid;
  unlock_item uuid;
  unlock_exercise uuid;
  friend_event uuid;
  enrollment_id uuid := gen_random_uuid();
begin
  select e.id into lift from public.exercises e where e.key is not null and e.load_type = 'external' order by e.key limit 1;
  select e.id into bodyweight_lift from public.exercises e where e.key is not null and e.load_type = 'bodyweight' order by e.key limit 1;
  select es.skill_id into skill from public.exercise_skills es where es.exercise_id = lift order by es.skill_id limit 1;
  select dt.id into table_id from public.drop_tables dt order by dt.key limit 1;
  select i.id into item from public.items i where i.grants_exercise_id is null order by i.key limit 1;
  select i.id, i.grants_exercise_id into unlock_item, unlock_exercise
  from public.items i where i.grants_exercise_id is not null order by i.key limit 1;

  insert into public.sets
    (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir_source, effective_reps, xp_awarded)
  values (set_id, session_id, give_everything.owner, lift, 0, 60, 60, 5, 'default', 5, 10);
  insert into public.set_skill_xp (set_id, skill_id, user_id, xp) values (set_id, skill, give_everything.owner, 10);
  insert into public.user_skills (user_id, skill_id, xp) values (give_everything.owner, skill, 10);
  insert into public.exercise_maxes (user_id, exercise_id, e1rm_kg) values (give_everything.owner, lift, 70);
  insert into public.rep_maxes (user_id, exercise_id, reps, load_kg, achieved_at)
  values (give_everything.owner, lift, 5, 60, now());
  insert into public.bodyweight_rep_records (user_id, exercise_id, max_reps, achieved_at)
  values (give_everything.owner, bodyweight_lift, 12, now());
  insert into public.cardio_records (user_id, exercise_id, kind, value, achieved_at)
  select give_everything.owner, e.id, 'distance', 5000, now() from public.exercises e where e.key = 'running';
  insert into public.pinned_exercises (user_id, exercise_id, position) values (give_everything.owner, lift, 0);
  insert into public.exercises (id, owner_user_id, name, load_type, equipment)
  values (custom_id, give_everything.owner, 'Test custom lift', 'external', 'other');
  insert into public.exercise_skills (exercise_id, skill_id, share_bp) values (custom_id, skill, 10000);
  insert into public.programs (id, owner_user_id, name) values (program_id, give_everything.owner, 'Test program');
  insert into public.program_days (id, program_id, position, name) values (day_id, program_id, 0, 'Day A');
  insert into public.program_day_exercises (day_id, position, exercise_id, target_sets, target_reps_min, target_reps_max)
  values (day_id, 0, lift, 3, 5, 8);
  insert into public.deleted_sessions (id, user_id, started_at) values (gen_random_uuid(), give_everything.owner, now());
  insert into public.loot_rolls
    (id, user_id, session_id, set_id, kind, local_date, roll_index, drop_table_id, chance, hit, loot_version)
  values (roll_id, give_everything.owner, session_id, set_id, 'regular', current_date, 0, table_id, 0.5, true, 1);
  insert into public.drops (user_id, loot_roll_id, session_id, set_id, item_id, quantity, source)
  values (give_everything.owner, roll_id, session_id, set_id, item, 1, 'regular');
  insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
  values (give_everything.owner, item, 1, 'drop', roll_id);
  insert into public.user_items (user_id, item_id, quantity) values (give_everything.owner, item, 1);
  insert into public.crafts (user_id, recipe_id) select give_everything.owner, r.id from public.recipes r order by r.key limit 1;
  insert into public.user_unlocks (user_id, exercise_id, item_id) values (give_everything.owner, unlock_exercise, unlock_item);
  insert into public.drop_luck (user_id, drop_table_id) values (give_everything.owner, table_id);
  perform tests.add_event(give_everything.owner, session_id, 'level:strength', 'level_up', '{"skill": "strength", "from": 9, "to": 10}');
  friend_event := tests.add_event(give_everything.friend, friend_session_id, 'level:strength', 'level_up', '{"skill": "strength", "from": 9, "to": 10}');
  perform tests.make_friends(give_everything.owner, give_everything.friend);
  insert into public.reactions (event_id, user_id) values (friend_event, give_everything.owner);
  insert into private.rate_limit_hits (bucket, subject, window_start, hits)
  values ('gz_minute', give_everything.owner, date_trunc('minute', now()), 1);
  insert into public.program_enrollments
    (id, user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding)
  select enrollment_id, give_everything.owner, t.key, t.version, 'kg', '{}', '{}', '{}',
         '{"increment": 2.5, "mode": "nearest", "barWeight": 20}'
  from public.program_templates t where t.key = 'madcow_5x5' and t.version = 1;
  insert into public.program_enrollment_events (enrollment_id, kind, payload)
  values (enrollment_id, 'skip_day', '{"position": {"week": 1, "day": "mon"}}');
end;
$$;

revoke all on all functions in schema tests from public, anon, authenticated;

select plan(6);
select has_function('tests', 'create_user', array['text', 'boolean']);
select has_function('tests', 'authenticate_as', array['uuid']);
select has_function('tests', 'add_session', array['uuid', 'timestamp with time zone']);
select has_function('tests', 'add_event', array['uuid', 'uuid', 'text', 'public.event_type', 'jsonb']);
select has_function('tests', 'make_friends', array['uuid', 'uuid']);
select has_function('tests', 'give_everything', array['uuid', 'uuid']);
select * from finish();
