create table public.programs (
  id uuid primary key,
  key text unique,
  owner_user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  copied_from_id uuid references public.programs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_have_a_key check ((owner_user_id is null) = (key is not null))
);
create index programs_by_owner on public.programs (owner_user_id);

create table public.program_days (
  id uuid primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  position int not null check (position between 0 and 13),
  name text not null check (char_length(name) between 1 and 40),
  constraint program_day_position_unique unique (program_id, position) deferrable initially deferred
);

create table public.program_day_exercises (
  day_id uuid not null references public.program_days (id) on delete cascade,
  position int not null check (position between 0 and 19),
  exercise_id uuid not null references public.exercises (id),
  target_sets int not null check (target_sets between 1 and 10),
  target_reps_min int not null check (target_reps_min between 1 and 100),
  target_reps_max int not null check (target_reps_max between target_reps_min and 100),
  primary key (day_id, position)
);

alter table public.sessions add constraint sessions_program_day_id_fkey
  foreign key (program_day_id) references public.program_days (id) on delete set null;
create index sessions_by_program_day on public.sessions (program_day_id) where program_day_id is not null;

alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_day_exercises enable row level security;

grant select on public.programs, public.program_days, public.program_day_exercises to authenticated;

create policy "read templates and own programs" on public.programs
  for select to authenticated using (owner_user_id is null or owner_user_id = (select auth.uid()));
create policy "read days of visible programs" on public.program_days
  for select to authenticated using (
    exists (
      select 1 from public.programs p
      where p.id = program_id and (p.owner_user_id is null or p.owner_user_id = (select auth.uid()))
    )
  );
create policy "read exercises of visible program days" on public.program_day_exercises
  for select to authenticated using (
    exists (
      select 1 from public.program_days d join public.programs p on p.id = d.program_id
      where d.id = day_id and (p.owner_user_id is null or p.owner_user_id = (select auth.uid()))
    )
  );

create function private.invalid_program()
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'invalid_program' using errcode = 'P0001';
end;
$$;

create function private.is_whole_number_between(value jsonb, lowest int, highest int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) is distinct from 'number' then false
    else value::text::numeric = trunc(value::text::numeric) and value::text::numeric between lowest and highest
  end;
$$;

create function private.is_valid_name(raw text, longest int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(private.trimmed_name(raw)) between 1 and longest
     and private.trimmed_name(raw) !~ '[[:cntrl:]]';
$$;

create function public.save_program(program jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  caller uuid := auth.uid();
  day jsonb;
  day_index bigint;
  planned jsonb;
  requested_id uuid;
  existing_owner uuid;
  program_exists boolean;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(program) is distinct from 'object' then
    perform private.invalid_program();
  end if;
  if jsonb_typeof(program -> 'id') is distinct from 'string'
     or jsonb_typeof(program -> 'name') is distinct from 'string'
     or jsonb_typeof(program -> 'days') is distinct from 'array' then
    perform private.invalid_program();
  end if;
  if program ->> 'id' !~ uuid_pattern
     or not private.is_valid_name(program ->> 'name', 60)
     or jsonb_array_length(program -> 'days') not between 1 and 14 then
    perform private.invalid_program();
  end if;

  for day in select value from jsonb_array_elements(program -> 'days') loop
    if jsonb_typeof(day) is distinct from 'object' then
      perform private.invalid_program();
    end if;
    if jsonb_typeof(day -> 'id') is distinct from 'string'
       or jsonb_typeof(day -> 'name') is distinct from 'string'
       or jsonb_typeof(day -> 'exercises') is distinct from 'array' then
      perform private.invalid_program();
    end if;
    if day ->> 'id' !~ uuid_pattern
       or not private.is_valid_name(day ->> 'name', 40)
       or jsonb_array_length(day -> 'exercises') > 20 then
      perform private.invalid_program();
    end if;
    for planned in select value from jsonb_array_elements(day -> 'exercises') loop
      if jsonb_typeof(planned) is distinct from 'object' then
        perform private.invalid_program();
      end if;
      if jsonb_typeof(planned -> 'exerciseId') is distinct from 'string'
         or planned ->> 'exerciseId' !~ uuid_pattern
         or not private.is_whole_number_between(planned -> 'targetSets', 1, 10)
         or not private.is_whole_number_between(planned -> 'targetRepsMin', 1, 100)
         or not private.is_whole_number_between(planned -> 'targetRepsMax', 1, 100) then
        perform private.invalid_program();
      end if;
      if (planned ->> 'targetRepsMin')::numeric > (planned ->> 'targetRepsMax')::numeric then
        perform private.invalid_program();
      end if;
    end loop;
  end loop;

  if (select count(distinct (value ->> 'id')::uuid) from jsonb_array_elements(program -> 'days'))
     <> jsonb_array_length(program -> 'days') then
    perform private.invalid_program();
  end if;

  requested_id := (program ->> 'id')::uuid;

  perform 1 from public.profiles p where p.id = caller for update;

  select p.owner_user_id into existing_owner from public.programs p where p.id = requested_id;
  program_exists := found;
  if program_exists and existing_owner is distinct from caller then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;
  if not program_exists
     and (select count(*) from public.programs p where p.owner_user_id = caller) >= 50 then
    raise exception 'too_many_programs' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(program -> 'days') requested
    join public.program_days d on d.id = (requested ->> 'id')::uuid
    where d.program_id <> requested_id
  ) then
    perform private.invalid_program();
  end if;

  if exists (
    select 1
    from jsonb_array_elements(program -> 'days') requested_day,
         jsonb_array_elements(requested_day -> 'exercises') requested_exercise
    where not exists (
      select 1 from public.exercises e
      where e.id = (requested_exercise ->> 'exerciseId')::uuid
        and (e.owner_user_id is null or e.owner_user_id = caller)
    )
  ) then
    raise exception 'unknown_exercise' using errcode = 'P0001';
  end if;

  insert into public.programs (id, key, owner_user_id, name)
  values (requested_id, null, caller, private.trimmed_name(program ->> 'name'))
  on conflict (id) do update set name = excluded.name, updated_at = now()
  where programs.owner_user_id = caller;
  if not found then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;

  delete from public.program_days d
  where d.program_id = requested_id
    and d.id not in (select (value ->> 'id')::uuid from jsonb_array_elements(program -> 'days'));

  for day, day_index in select value, ordinality from jsonb_array_elements(program -> 'days') with ordinality loop
    insert into public.program_days (id, program_id, position, name)
    values ((day ->> 'id')::uuid, requested_id, day_index - 1, private.trimmed_name(day ->> 'name'))
    on conflict (id) do update set position = excluded.position, name = excluded.name
    where program_days.program_id = requested_id;
    if not found then
      perform private.invalid_program();
    end if;

    delete from public.program_day_exercises x where x.day_id = (day ->> 'id')::uuid;
    insert into public.program_day_exercises
      (day_id, position, exercise_id, target_sets, target_reps_min, target_reps_max)
    select (day ->> 'id')::uuid, planned_index - 1, (planned_exercise ->> 'exerciseId')::uuid,
           (planned_exercise ->> 'targetSets')::numeric, (planned_exercise ->> 'targetRepsMin')::numeric,
           (planned_exercise ->> 'targetRepsMax')::numeric
    from jsonb_array_elements(day -> 'exercises') with ordinality as planned (planned_exercise, planned_index);
  end loop;

  update public.programs p set updated_at = now() where p.id = requested_id;
  return requested_id;
end;
$$;

create function public.copy_program(source_program_id uuid, new_program_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  source_owner uuid;
  source_name text;
  existing_owner uuid;
  existing_source uuid;
  source_day record;
  copied_day_id uuid;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if source_program_id is null or new_program_id is null then
    perform private.invalid_program();
  end if;

  perform 1 from public.profiles p where p.id = caller for update;

  select p.owner_user_id, p.name into source_owner, source_name
  from public.programs p where p.id = source_program_id;
  if not found or (source_owner is not null and source_owner <> caller) then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;

  select p.owner_user_id, p.copied_from_id into existing_owner, existing_source
  from public.programs p where p.id = new_program_id;
  if found then
    if existing_owner = caller and existing_source = source_program_id then
      return new_program_id;
    end if;
    perform private.invalid_program();
  end if;

  if (select count(*) from public.programs p where p.owner_user_id = caller) >= 50 then
    raise exception 'too_many_programs' using errcode = 'P0001';
  end if;

  insert into public.programs (id, key, owner_user_id, name, copied_from_id)
  values (new_program_id, null, caller, source_name, source_program_id);

  for source_day in
    select d.id, d.position, d.name from public.program_days d
    where d.program_id = source_program_id order by d.position
  loop
    copied_day_id := gen_random_uuid();
    insert into public.program_days (id, program_id, position, name)
    values (copied_day_id, new_program_id, source_day.position, source_day.name);
    insert into public.program_day_exercises
      (day_id, position, exercise_id, target_sets, target_reps_min, target_reps_max)
    select copied_day_id, x.position, x.exercise_id, x.target_sets, x.target_reps_min, x.target_reps_max
    from public.program_day_exercises x where x.day_id = source_day.id;
  end loop;

  return new_program_id;
end;
$$;

create function public.delete_program(program_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform 1 from public.profiles p where p.id = caller for update;
  delete from public.programs p where p.id = delete_program.program_id and p.owner_user_id = caller;
  if not found then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.last_logged_sets(exercise_ids uuid[])
returns table (exercise_id uuid, weight_kg numeric, reps int)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.exercise_id) s.exercise_id, s.weight_kg, s.reps
  from public.sets s join public.sessions se on se.id = s.session_id
  where s.user_id = (select auth.uid()) and s.exercise_id = any(exercise_ids) and not s.is_warmup
  order by s.exercise_id, se.started_at desc, se.id desc, s.position desc;
$$;

revoke execute on function private.invalid_program() from public, anon, authenticated;
revoke execute on function private.is_whole_number_between(jsonb, int, int) from public, anon, authenticated;
revoke execute on function private.is_valid_name(text, int) from public, anon, authenticated;
revoke execute on function public.save_program(jsonb) from public, anon;
revoke execute on function public.copy_program(uuid, uuid) from public, anon;
revoke execute on function public.delete_program(uuid) from public, anon;
revoke execute on function public.last_logged_sets(uuid[]) from public, anon;
grant execute on function public.save_program(jsonb) to authenticated;
grant execute on function public.copy_program(uuid, uuid) to authenticated;
grant execute on function public.delete_program(uuid) to authenticated;
grant execute on function public.last_logged_sets(uuid[]) to authenticated;
