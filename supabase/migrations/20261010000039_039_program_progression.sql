alter table public.program_day_exercises
  add column progression text not null default 'none'
    constraint program_exercise_progression_is_known check (progression in ('none', 'fixed', 'linear')),
  add column increment_kg numeric(5,2) constraint increment_kg_in_range check (increment_kg between 0.25 and 20),
  add column increment_lb numeric(5,2) constraint increment_lb_in_range check (increment_lb between 0.5 and 45),
  add constraint only_linear_progression_has_increments check (
    (progression = 'linear') = (increment_kg is not null)
    and (progression = 'linear') = (increment_lb is not null)
  );

create function private.is_increment_between(value jsonb, lowest numeric, highest numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) is distinct from 'number' then false
    else value::text::numeric = round(value::text::numeric, 2) and value::text::numeric between lowest and highest
  end;
$$;

revoke execute on function private.is_increment_between(jsonb, numeric, numeric) from public, anon, authenticated;

create or replace function public.save_program(program jsonb)
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
  planned_progression text;
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
      if coalesce(jsonb_typeof(planned -> 'progression'), 'null') not in ('string', 'null') then
        perform private.invalid_program();
      end if;
      planned_progression := coalesce(planned ->> 'progression', 'none');
      if planned_progression not in ('none', 'fixed', 'linear') then
        perform private.invalid_program();
      end if;
      if planned_progression = 'linear' then
        if not private.is_increment_between(planned -> 'incrementKg', 0.25, 20)
           or not private.is_increment_between(planned -> 'incrementLb', 0.5, 45)
           or (planned ->> 'targetRepsMin')::numeric <> (planned ->> 'targetRepsMax')::numeric then
          perform private.invalid_program();
        end if;
      elsif coalesce(jsonb_typeof(planned -> 'incrementKg'), 'null') <> 'null'
         or coalesce(jsonb_typeof(planned -> 'incrementLb'), 'null') <> 'null' then
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
        and e.modality = 'lift'
        and (e.owner_user_id is null or e.owner_user_id = caller)
    )
  ) then
    raise exception 'unknown_exercise' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(program -> 'days') requested_day,
         jsonb_array_elements(requested_day -> 'exercises') requested_exercise
    join public.exercises e on e.id = (requested_exercise ->> 'exerciseId')::uuid
    where coalesce(requested_exercise ->> 'progression', 'none') <> 'none'
      and e.load_type <> 'external'
  ) then
    perform private.invalid_program();
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
      (day_id, position, exercise_id, target_sets, target_reps_min, target_reps_max,
       progression, increment_kg, increment_lb)
    select (day ->> 'id')::uuid, planned_index - 1, (planned_exercise ->> 'exerciseId')::uuid,
           (planned_exercise ->> 'targetSets')::numeric, (planned_exercise ->> 'targetRepsMin')::numeric,
           (planned_exercise ->> 'targetRepsMax')::numeric, coalesce(planned_exercise ->> 'progression', 'none'),
           (planned_exercise ->> 'incrementKg')::numeric, (planned_exercise ->> 'incrementLb')::numeric
    from jsonb_array_elements(day -> 'exercises') with ordinality as planned (planned_exercise, planned_index);
  end loop;

  update public.programs p set updated_at = now() where p.id = requested_id;
  return requested_id;
end;
$$;

revoke execute on function public.save_program(jsonb) from public, anon;
grant execute on function public.save_program(jsonb) to authenticated;

create or replace function public.copy_program(source_program_id uuid, new_program_id uuid)
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
      (day_id, position, exercise_id, target_sets, target_reps_min, target_reps_max,
       progression, increment_kg, increment_lb)
    select copied_day_id, x.position, x.exercise_id, x.target_sets, x.target_reps_min, x.target_reps_max,
           x.progression, x.increment_kg, x.increment_lb
    from public.program_day_exercises x where x.day_id = source_day.id;
  end loop;

  return new_program_id;
end;
$$;

revoke execute on function public.copy_program(uuid, uuid) from public, anon;
grant execute on function public.copy_program(uuid, uuid) to authenticated;
