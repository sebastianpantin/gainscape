drop policy "read built-in, unlocked and own exercises" on public.exercises;
create policy "read built-in and own exercises" on public.exercises
  for select to authenticated using (owner_user_id = (select auth.uid()) or owner_user_id is null);

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
        and e.modality = 'lift'
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

revoke execute on function public.save_program(jsonb) from public, anon;
grant execute on function public.save_program(jsonb) to authenticated;

create or replace function private.collection_counts(target uuid)
returns table (filled_slots int, total_slots int)
language sql
stable
set search_path = ''
as $$
  with visible as (
    select e.id, e.load_type
    from public.exercises e
    where e.modality = 'lift'
      and (e.owner_user_id = collection_counts.target
        or e.owner_user_id is null)
  ),
  counted as (
    select pe.exercise_id from public.pinned_exercises pe where pe.user_id = collection_counts.target
    union
    select r.exercise_id from public.rep_maxes r where r.user_id = collection_counts.target
    union
    select b.exercise_id from public.bodyweight_rep_records b where b.user_id = collection_counts.target
  )
  select
    coalesce(sum(case
      when v.load_type = 'bodyweight' then (exists (
        select 1 from public.bodyweight_rep_records b
        where b.user_id = collection_counts.target and b.exercise_id = v.id))::int
      else least(10, (
        select count(*) from public.rep_maxes r
        where r.user_id = collection_counts.target and r.exercise_id = v.id and r.exact_set_id is not null))::int
    end), 0)::int,
    coalesce(sum(case when v.load_type = 'bodyweight' then 1 else 10 end), 0)::int
  from counted c
  join visible v on v.id = c.exercise_id;
$$;

revoke execute on function private.collection_counts(uuid) from public, anon, authenticated;

create or replace function public.get_collection(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  hide_loads boolean;
  result jsonb;
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not private.can_view_user(caller, get_collection.target) then
    return null;
  end if;

  select caller <> p.id and not p.show_weights into hide_loads
  from public.profiles p
  where p.id = get_collection.target;
  if not found then
    return null;
  end if;

  with visible as (
    select e.id, e.name, e.load_type, e.owner_user_id is null as built_in
    from public.exercises e
    where e.modality = 'lift'
      and (e.owner_user_id = get_collection.target
        or e.owner_user_id is null)
  ),
  pins as (
    select pe.exercise_id, pe.position from public.pinned_exercises pe where pe.user_id = get_collection.target
  ),
  done as (
    select r.exercise_id from public.rep_maxes r where r.user_id = get_collection.target
    union
    select b.exercise_id from public.bodyweight_rep_records b where b.user_id = get_collection.target
  ),
  counted as (
    select v.id, v.load_type, v.built_in,
           case when v.built_in or caller = get_collection.target then v.name else private.custom_exercise_label() end
             as shown_name,
           pn.position
    from visible v
    left join pins pn on pn.exercise_id = v.id
    where pn.exercise_id is not null or exists (select 1 from done d where d.exercise_id = v.id)
  )
  select jsonb_build_object(
    'userId', get_collection.target,
    'weightsHidden', hide_loads,
    'completion', (
      select jsonb_build_object('filledSlots', cc.filled_slots, 'totalSlots', cc.total_slots)
      from private.collection_counts(get_collection.target) cc),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exerciseId', c.id,
        'name', c.shown_name,
        'loadType', c.load_type,
        'builtIn', c.built_in,
        'pinned', c.position is not null,
        'repMaxes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'reps', r.reps,
            'loadKg', case when hide_loads then null else r.load_kg end,
            'exact', r.exact_set_id is not null) order by r.reps)
          from public.rep_maxes r
          where r.user_id = get_collection.target and r.exercise_id = c.id), '[]'::jsonb),
        'maxReps', (
          select b.max_reps from public.bodyweight_rep_records b
          where b.user_id = get_collection.target and b.exercise_id = c.id))
        order by c.position is null, c.position, lower(c.shown_name), c.id)
      from counted c), '[]'::jsonb),
    'items', jsonb_build_object(
      'found', coalesce((
        select jsonb_agg(jsonb_build_object(
          'itemId', ui.item_id,
          'quantity', ui.quantity,
          'firstObtainedAt', ui.first_obtained_at) order by i.sort_order, i.id)
        from public.user_items ui
        join public.items i on i.id = ui.item_id
        where ui.user_id = get_collection.target), '[]'::jsonb),
      'catalogCount', (select count(*)::int from public.items i where i.retired_at is null))
  ) into result;
  return result;
end;
$$;

revoke execute on function public.get_collection(uuid) from public, anon;
grant execute on function public.get_collection(uuid) to authenticated;

create or replace function public.craft(recipe_id uuid)
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
  spent_slot public.gear_slot;
  equipped_slot public.gear_slot;
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
  join public.items o on o.id = r.output_item_id
  where r.id = craft.recipe_id
    and r.retired_at is null
    and o.retired_at is null
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

  select l.slot into spent_slot
  from public.user_loadout l
  join public.recipe_inputs i on i.item_id = l.item_id
  where l.user_id = caller and i.recipe_id = chosen.id
  order by l.slot
  limit 1;

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

  if spent_slot is not null
     and not exists (select 1 from public.user_loadout l where l.user_id = caller and l.slot = spent_slot) then
    insert into public.user_loadout (user_id, slot, item_id)
    select caller, o.gear_slot, o.id
    from public.items o
    where o.id = chosen.output_item_id and o.kind = 'gear' and o.gear_slot = spent_slot
    returning slot into equipped_slot;
  end if;

  return jsonb_build_object('craftId', new_craft_id, 'itemId', chosen.output_item_id, 'quantity', held_after,
                            'equippedSlot', equipped_slot);
end;
$$;

revoke execute on function public.craft(uuid) from public, anon;
grant execute on function public.craft(uuid) to authenticated;

drop table public.user_unlocks;

alter table public.exercises drop column requires_unlock;
