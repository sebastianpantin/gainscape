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

revoke all on all functions in schema tests from public, anon, authenticated;

select plan(5);
select has_function('tests', 'create_user', array['text', 'boolean']);
select has_function('tests', 'authenticate_as', array['uuid']);
select has_function('tests', 'add_session', array['uuid', 'timestamp with time zone']);
select has_function('tests', 'add_event', array['uuid', 'uuid', 'text', 'public.event_type', 'jsonb']);
select has_function('tests', 'make_friends', array['uuid', 'uuid']);
select * from finish();
