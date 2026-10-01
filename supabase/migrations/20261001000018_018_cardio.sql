create type public.exercise_modality as enum ('lift', 'cardio');
create type public.cardio_effort_level as enum ('easy', 'moderate', 'hard', 'max');
create type public.pace_unit as enum ('per_km', 'per_100m');

alter table public.skills add column modality public.exercise_modality not null default 'lift';

alter table public.exercises add column modality public.exercise_modality not null default 'lift';
alter table public.exercises alter column load_type drop not null;
alter table public.exercises
  add column reference_pace_s_per_km int check (reference_pace_s_per_km between 1 and 36000),
  add column pace_unit public.pace_unit,
  add column max_effort public.cardio_effort_level,
  add column record_min_distance_m int check (record_min_distance_m between 1 and 200000);
alter table public.exercises add constraint exercise_fields_match_modality check (
  case modality
    when 'lift' then load_type is not null
      and num_nulls(reference_pace_s_per_km, pace_unit, max_effort, record_min_distance_m) = 4
    else load_type is null
      and pace_unit is not null
      and max_effort is not null
      and (record_min_distance_m is null or reference_pace_s_per_km is not null)
  end
);

create function private.forbid_modality_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'modality of % % cannot change', tg_table_name, old.id using errcode = 'check_violation';
end;
$$;

create trigger lock_modality
before update of modality on public.exercises
for each row when (new.modality is distinct from old.modality)
execute function private.forbid_modality_change();

create trigger lock_modality
before update of modality on public.skills
for each row when (new.modality is distinct from old.modality)
execute function private.forbid_modality_change();

alter table public.sets alter column weight_kg drop not null;
alter table public.sets alter column effective_load_kg drop not null;
alter table public.sets alter column reps drop not null;
alter table public.sets
  add column duration_s int,
  add column distance_m numeric(8, 1) check (distance_m between 1 and 200000),
  add column interval_work_s int check (interval_work_s between 5 and 3600),
  add column interval_rest_s int check (interval_rest_s between 0 and 3600),
  add column interval_rounds int check (interval_rounds between 1 and 100),
  add column counted_work_s int,
  add column pace_flagged boolean not null default false;

alter table public.sets add constraint set_is_lift_xor_cardio check (
  (
    reps is not null and weight_kg is not null and effective_load_kg is not null
    and num_nulls(duration_s, distance_m, interval_work_s, interval_rest_s, interval_rounds, counted_work_s) = 6
    and not pace_flagged
  )
  or (
    duration_s is not null and counted_work_s is not null
    and reps is null and weight_kg is null and effective_load_kg is null
    and rir is null and effective_reps = 0 and not is_warmup
  )
);
alter table public.sets add constraint interval_columns_set_together check (
  num_nulls(interval_work_s, interval_rest_s, interval_rounds) in (0, 3)
);
alter table public.sets add constraint cardio_duration_within_bounds check (
  duration_s is null
  or case
    when interval_rounds is null then duration_s between 60 and 14400 and counted_work_s = duration_s
    else duration_s between 5 and 14400
      and duration_s = interval_rounds * interval_work_s + (interval_rounds - 1) * interval_rest_s
      and counted_work_s = interval_rounds * interval_work_s
  end
);
alter table public.sets add constraint effort_matches_set_kind check (
  case
    when duration_s is null then effort_input_type is distinct from 'cardio'
    else effort_input_type is null or (effort_input_type = 'cardio' and effort_value in (1, 2, 3, 4))
  end
);

alter table public.profile_private add constraint effort_input_mode_is_a_lift_mode check (effort_input_mode <> 'cardio');

create or replace function private.assert_exercise_shares_sum_to_full(target_exercise_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  share_total int;
  exercise_modality public.exercise_modality;
begin
  select e.modality into exercise_modality from public.exercises e where e.id = target_exercise_id;
  if not found then
    return;
  end if;
  select coalesce(sum(share_bp), 0) into share_total
  from public.exercise_skills
  where exercise_id = target_exercise_id;
  if share_total <> 10000 then
    raise exception 'exercise % skill shares sum to % basis points, expected 10000', target_exercise_id, share_total
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.exercise_skills es
    join public.skills s on s.id = es.skill_id
    where es.exercise_id = target_exercise_id and s.modality <> exercise_modality
  ) then
    raise exception 'exercise % shares XP with a skill of another modality', target_exercise_id
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.save_custom_exercise(exercise jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  caller uuid := auth.uid();
  share jsonb;
  requested_id uuid;
  requested_name text;
  requested_modality public.exercise_modality;
  requested_load_type public.load_type;
  requested_equipment public.equipment;
  requested_shares jsonb;
  existing_owner uuid;
  existing_load_type public.load_type;
  exercise_exists boolean;
  logged boolean;
  shares_differ boolean;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(exercise) is distinct from 'object' then
    perform private.invalid_exercise();
  end if;
  if jsonb_typeof(exercise -> 'id') is distinct from 'string'
     or jsonb_typeof(exercise -> 'name') is distinct from 'string'
     or jsonb_typeof(exercise -> 'equipment') is distinct from 'string'
     or jsonb_typeof(exercise -> 'shares') is distinct from 'array'
     or coalesce(jsonb_typeof(exercise -> 'modality'), 'string') not in ('string', 'null') then
    perform private.invalid_exercise();
  end if;
  if not (coalesce(exercise ->> 'modality', 'lift') = any(enum_range(null::public.exercise_modality)::text[])) then
    perform private.invalid_exercise();
  end if;
  requested_modality := coalesce(exercise ->> 'modality', 'lift')::public.exercise_modality;
  if requested_modality = 'lift' and jsonb_typeof(exercise -> 'loadType') is distinct from 'string' then
    perform private.invalid_exercise();
  end if;
  if requested_modality = 'cardio' and coalesce(jsonb_typeof(exercise -> 'loadType'), 'null') <> 'null' then
    perform private.invalid_exercise();
  end if;
  if jsonb_array_length(exercise -> 'shares') not between 1 and 6
     or exercise ->> 'id' !~ uuid_pattern
     or (requested_modality = 'lift'
         and not (exercise ->> 'loadType' = any(enum_range(null::public.load_type)::text[])))
     or not (exercise ->> 'equipment' = any(enum_range(null::public.equipment)::text[])) then
    perform private.invalid_exercise();
  end if;

  for share in select value from jsonb_array_elements(exercise -> 'shares') loop
    if jsonb_typeof(share) is distinct from 'object' then
      perform private.invalid_exercise();
    end if;
    if jsonb_typeof(share -> 'skillId') is distinct from 'string'
       or jsonb_typeof(share -> 'shareBp') is distinct from 'number' then
      perform private.invalid_exercise();
    end if;
    if share ->> 'skillId' !~ uuid_pattern
       or (share ->> 'shareBp')::numeric <> trunc((share ->> 'shareBp')::numeric)
       or (share ->> 'shareBp')::numeric not between 1 and 10000 then
      perform private.invalid_exercise();
    end if;
  end loop;

  requested_id := (exercise ->> 'id')::uuid;
  requested_name := private.trimmed_name(exercise ->> 'name');
  requested_load_type := (exercise ->> 'loadType')::public.load_type;
  requested_equipment := (exercise ->> 'equipment')::public.equipment;
  requested_shares := exercise -> 'shares';

  if exists (
    select 1 from public.exercises e
    where e.id = requested_id and e.owner_user_id = caller and e.modality <> requested_modality
  ) then
    raise exception 'modality_locked' using errcode = 'P0001';
  end if;

  if char_length(requested_name) not between 1 and 60
     or requested_name ~ '[[:cntrl:]]'
     or (select count(distinct r."skillId") from jsonb_to_recordset(requested_shares) as r ("skillId" uuid))
        <> jsonb_array_length(requested_shares)
     or exists (
       select 1 from jsonb_to_recordset(requested_shares) as r ("skillId" uuid)
       where not exists (
         select 1 from public.skills s where s.id = r."skillId" and s.modality = requested_modality)
     )
     or (select sum(r."shareBp") from jsonb_to_recordset(requested_shares) as r ("shareBp" numeric)) <> 10000 then
    perform private.invalid_exercise();
  end if;

  perform 1 from public.profiles p where p.id = caller for update;

  select e.owner_user_id, e.load_type into existing_owner, existing_load_type
  from public.exercises e where e.id = requested_id;
  exercise_exists := found;
  if exercise_exists and existing_owner is distinct from caller then
    raise exception 'exercise_not_found' using errcode = 'P0001';
  end if;

  if not exercise_exists then
    if (select count(*) from public.exercises e where e.owner_user_id = caller) >= 100 then
      raise exception 'too_many_custom_exercises' using errcode = 'P0001';
    end if;
  else
    logged := exists (select 1 from public.sets s where s.exercise_id = requested_id);
    if logged and existing_load_type is distinct from requested_load_type then
      raise exception 'load_type_locked' using errcode = 'P0001';
    end if;
    shares_differ := exists (
      (select r."skillId", r."shareBp" from jsonb_to_recordset(requested_shares) as r ("skillId" uuid, "shareBp" numeric)
       except
       select es.skill_id, es.share_bp from public.exercise_skills es where es.exercise_id = requested_id)
      union all
      (select es.skill_id, es.share_bp from public.exercise_skills es where es.exercise_id = requested_id
       except
       select r."skillId", r."shareBp" from jsonb_to_recordset(requested_shares) as r ("skillId" uuid, "shareBp" numeric))
    );
    if logged and shares_differ then
      raise exception 'shares_locked' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1 from public.exercises e
    where e.owner_user_id = caller and lower(e.name) = lower(requested_name) and e.id <> requested_id
  ) then
    raise exception 'name_taken' using errcode = 'P0001';
  end if;

  if not exercise_exists then
    insert into public.exercises
      (id, key, name, modality, load_type, equipment, owner_user_id, variation_of_id, pace_unit, max_effort)
    values (
      requested_id, null, requested_name, requested_modality, requested_load_type, requested_equipment, caller, null,
      case when requested_modality = 'cardio' then 'per_km'::public.pace_unit end,
      case when requested_modality = 'cardio' then 'max'::public.cardio_effort_level end
    );
    insert into public.exercise_skills (exercise_id, skill_id, share_bp)
    select requested_id, r."skillId", r."shareBp"
    from jsonb_to_recordset(requested_shares) as r ("skillId" uuid, "shareBp" numeric);
  else
    update public.exercises e
    set name = requested_name, equipment = requested_equipment, load_type = requested_load_type, updated_at = now()
    where e.id = requested_id;
    if shares_differ then
      delete from public.exercise_skills es where es.exercise_id = requested_id;
      insert into public.exercise_skills (exercise_id, skill_id, share_bp)
      select requested_id, r."skillId", r."shareBp"
      from jsonb_to_recordset(requested_shares) as r ("skillId" uuid, "shareBp" numeric);
    end if;
  end if;

  return requested_id;
end;
$$;

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
        or (e.owner_user_id is null and (not e.requires_unlock or exists (
          select 1 from public.user_unlocks ul where ul.user_id = collection_counts.target and ul.exercise_id = e.id))))
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
        or (e.owner_user_id is null and (not e.requires_unlock or exists (
          select 1 from public.user_unlocks ul where ul.user_id = get_collection.target and ul.exercise_id = e.id))))
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

revoke execute on function private.forbid_modality_change() from public, anon, authenticated;
