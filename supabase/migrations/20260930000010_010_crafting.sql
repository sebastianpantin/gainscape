create table public.crafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id),
  created_at timestamptz not null default now()
);
create index crafts_by_user on public.crafts (user_id, created_at);

alter table public.crafts enable row level security;
grant select on public.crafts to authenticated;
create policy "read own crafts" on public.crafts for select to authenticated using (user_id = (select auth.uid()));

create function public.craft(recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  chosen public.recipes%rowtype;
  shortfall jsonb;
  new_craft_id uuid;
  held_after int;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.profiles p where p.id = caller for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'no_data_found';
  end if;

  select r.* into chosen
  from public.recipes r
  where r.id = craft.recipe_id
    and r.retired_at is null
    and exists (select 1 from public.recipe_inputs i where i.recipe_id = r.id);
  if not found then
    raise exception 'unknown_recipe' using errcode = 'invalid_parameter_value';
  end if;

  perform 1
  from public.user_items u
  where u.user_id = caller
    and u.item_id in (select i.item_id from public.recipe_inputs i where i.recipe_id = chosen.id)
  order by u.item_id
  for update;

  select jsonb_agg(jsonb_build_object('itemId', i.item_id, 'have', coalesce(u.quantity, 0), 'need', i.quantity)
                   order by i.item_id)
  into shortfall
  from public.recipe_inputs i
  left join public.user_items u on u.user_id = caller and u.item_id = i.item_id
  where i.recipe_id = chosen.id and coalesce(u.quantity, 0) < i.quantity;
  if shortfall is not null then
    raise exception 'insufficient_items' using errcode = 'check_violation', detail = shortfall::text;
  end if;

  insert into public.crafts (user_id, recipe_id) values (caller, chosen.id) returning id into new_craft_id;

  insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
  select caller, i.item_id, -i.quantity, 'craft_out', new_craft_id
  from public.recipe_inputs i
  where i.recipe_id = chosen.id
  order by i.item_id;

  update public.user_items u
  set quantity = u.quantity - i.quantity, updated_at = now()
  from public.recipe_inputs i
  where i.recipe_id = chosen.id and u.user_id = caller and u.item_id = i.item_id;

  insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
  values (caller, chosen.output_item_id, chosen.output_quantity, 'craft_in', new_craft_id);

  insert into public.user_items as held (user_id, item_id, quantity)
  values (caller, chosen.output_item_id, chosen.output_quantity)
  on conflict (user_id, item_id) do update
  set quantity = held.quantity + excluded.quantity, updated_at = now()
  returning held.quantity into held_after;

  return jsonb_build_object('craftId', new_craft_id, 'itemId', chosen.output_item_id, 'quantity', held_after);
end;
$$;

revoke execute on function public.craft(uuid) from public, anon;
grant execute on function public.craft(uuid) to authenticated;

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
        and (not e.requires_unlock or exists (
          select 1 from public.user_unlocks u where u.user_id = caller and u.exercise_id = e.id))
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

revoke execute on function public.save_program(jsonb) from public, anon;
grant execute on function public.save_program(jsonb) to authenticated;

create function private.forbid_append_only_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only' using errcode = 'restrict_violation', detail = tg_table_name;
end;
$$;

create trigger loot_rolls_are_never_truncated
before truncate on public.loot_rolls
for each statement execute function private.forbid_append_only_truncate();

create trigger item_ledger_is_never_truncated
before truncate on public.item_ledger
for each statement execute function private.forbid_append_only_truncate();

revoke execute on function private.forbid_append_only_truncate() from public, anon, authenticated;
