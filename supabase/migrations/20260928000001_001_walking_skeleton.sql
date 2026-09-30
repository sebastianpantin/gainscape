create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.load_type as enum ('external', 'bodyweight', 'bodyweight_plus');
create type public.effort_input_type as enum ('level', 'rir', 'rpe');
create type public.rir_source as enum ('logged', 'estimated', 'cold_start', 'default');
create type public.unit_pref as enum ('kg', 'lb');
create type public.equipment as enum ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  show_weights boolean not null default true,
  show_bodyweight boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bodyweight_kg numeric(5, 2) check (bodyweight_kg between 20 and 400),
  unit_pref public.unit_pref not null default 'kg',
  effort_input_mode public.effort_input_type not null default 'level',
  timezone text not null default 'UTC',
  timezone_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key,
  key text not null unique,
  name text not null,
  sort_order int not null unique,
  combat_weight numeric(4, 2) not null check (combat_weight >= 0),
  created_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  name text not null check (char_length(name) between 1 and 60),
  load_type public.load_type not null,
  equipment public.equipment not null,
  owner_user_id uuid references public.profiles (id) on delete cascade,
  archived_at timestamptz,
  variation_of_id uuid references public.exercises (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint built_in_exercises_have_a_key check ((owner_user_id is null) = (key is not null))
);
create unique index exercises_custom_name_unique on public.exercises (owner_user_id, lower(name)) where owner_user_id is not null;
create unique index exercises_built_in_name_unique on public.exercises (lower(name)) where owner_user_id is null;

create table public.exercise_skills (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  skill_id uuid not null references public.skills (id),
  share_bp int not null check (share_bp between 1 and 10000),
  primary key (exercise_id, skill_id)
);

create table public.sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_day_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  completed_at timestamptz not null default now(),
  local_date date not null,
  timezone text not null,
  history_only boolean not null default false,
  balance_version int not null,
  summary jsonb not null,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_ends_after_it_starts check (ended_at >= started_at)
);
create index sessions_by_user_newest_first on public.sessions (user_id, started_at desc);

create table public.sets (
  id uuid primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position int not null check (position >= 0),
  weight_kg numeric(6, 2) not null check (weight_kg between 0 and 2000),
  effective_load_kg numeric(6, 2) not null check (effective_load_kg >= 0),
  reps int not null check (reps between 1 and 100),
  is_warmup boolean not null default false,
  effort_input_type public.effort_input_type,
  effort_value numeric(3, 1),
  rir numeric(3, 1) not null check (rir >= 0),
  rir_source public.rir_source not null,
  rir_flagged boolean not null default false,
  e1rm_before_kg numeric(6, 2),
  effective_reps int not null check (effective_reps >= 0),
  xp_awarded int not null check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, position),
  constraint effort_type_and_value_set_together check ((effort_input_type is null) = (effort_value is null))
);
create index sets_by_user_and_exercise on public.sets (user_id, exercise_id);

create table public.set_skill_xp (
  set_id uuid not null references public.sets (id) on delete cascade,
  skill_id uuid not null references public.skills (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  xp int not null check (xp >= 0),
  primary key (set_id, skill_id)
);

create table public.user_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id),
  xp bigint not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create function private.assert_exercise_shares_sum_to_full(target_exercise_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  share_total int;
begin
  if not exists (select 1 from public.exercises where id = target_exercise_id) then
    return;
  end if;
  select coalesce(sum(share_bp), 0) into share_total
  from public.exercise_skills
  where exercise_id = target_exercise_id;
  if share_total <> 10000 then
    raise exception 'exercise % skill shares sum to % basis points, expected 10000', target_exercise_id, share_total
      using errcode = 'check_violation';
  end if;
end;
$$;

create function private.check_shares_after_exercise_skills_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_exercise_shares_sum_to_full(old.exercise_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.assert_exercise_shares_sum_to_full(new.exercise_id);
  end if;
  return null;
end;
$$;

create function private.check_shares_after_exercise_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_exercise_shares_sum_to_full(new.id);
  return null;
end;
$$;

create constraint trigger exercise_skill_shares_sum_to_full
after insert or update or delete on public.exercise_skills
deferrable initially deferred
for each row execute function private.check_shares_after_exercise_skills_change();

create constraint trigger new_exercise_has_full_skill_shares
after insert on public.exercises
deferrable initially deferred
for each row execute function private.check_shares_after_exercise_insert();

create function private.prevent_load_type_change_once_logged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.load_type is distinct from old.load_type
     and exists (select 1 from public.sets where exercise_id = old.id) then
    raise exception 'load_type of exercise % cannot change after sets were logged', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger lock_load_type_once_logged
before update of load_type on public.exercises
for each row execute function private.prevent_load_type_change_once_logged();

create function private.valid_timezone_or_utc(candidate text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select name from pg_catalog.pg_timezone_names
      where name = candidate and name not like 'posix/%' and name not in ('Factory', 'localtime')
    ),
    'UTC'
  );
$$;

create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(new.raw_user_meta_data ->> 'username');
begin
  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.profiles where username = requested_username) then
    raise exception 'username_taken' using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), requested_username));

  insert into public.profile_private (user_id, timezone)
  values (new.id, private.valid_timezone_or_utc(new.raw_user_meta_data ->> 'timezone'));

  return new;
end;
$$;

create trigger create_profile_on_signup
after insert on auth.users
for each row execute function private.create_profile_for_new_user();

create function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(candidate));
$$;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.skills enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_skills enable row level security;
alter table public.sessions enable row level security;
alter table public.sets enable row level security;
alter table public.set_skill_xp enable row level security;
alter table public.user_skills enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.profiles, public.profile_private, public.skills, public.exercises, public.exercise_skills,
  public.sessions, public.sets, public.set_skill_xp, public.user_skills
to authenticated;
grant update (display_name, show_weights, show_bodyweight) on public.profiles to authenticated;
grant update (unit_pref, effort_input_mode) on public.profile_private to authenticated;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read own private profile" on public.profile_private
  for select to authenticated using (user_id = (select auth.uid()));
create policy "update own private profile" on public.profile_private
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read skills" on public.skills
  for select to authenticated using (true);

create policy "read built-in and own exercises" on public.exercises
  for select to authenticated using (owner_user_id is null or owner_user_id = (select auth.uid()));

create policy "read shares of visible exercises" on public.exercise_skills
  for select to authenticated using (
    exists (
      select 1 from public.exercises e
      where e.id = exercise_id and (e.owner_user_id is null or e.owner_user_id = (select auth.uid()))
    )
  );

create policy "read own sessions" on public.sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own sets" on public.sets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own set xp" on public.set_skill_xp
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own skill xp" on public.user_skills
  for select to authenticated using (user_id = (select auth.uid()));
