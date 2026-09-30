alter function private.check_shares_after_exercise_skills_change() security definer;
alter function private.check_shares_after_exercise_skills_change() set search_path = '';
alter function private.check_shares_after_exercise_insert() security definer;
alter function private.check_shares_after_exercise_insert() set search_path = '';

create function private.invalid_exercise()
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'invalid_exercise' using errcode = 'P0001';
end;
$$;

create function public.save_custom_exercise(exercise jsonb)
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
     or jsonb_typeof(exercise -> 'loadType') is distinct from 'string'
     or jsonb_typeof(exercise -> 'equipment') is distinct from 'string'
     or jsonb_typeof(exercise -> 'shares') is distinct from 'array' then
    perform private.invalid_exercise();
  end if;
  if jsonb_array_length(exercise -> 'shares') not between 1 and 6
     or exercise ->> 'id' !~ uuid_pattern
     or not (exercise ->> 'loadType' = any(enum_range(null::public.load_type)::text[]))
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
  requested_name := regexp_replace(exercise ->> 'name', '^\s+|\s+$', '', 'g');
  requested_load_type := (exercise ->> 'loadType')::public.load_type;
  requested_equipment := (exercise ->> 'equipment')::public.equipment;
  requested_shares := exercise -> 'shares';

  if char_length(requested_name) not between 1 and 60
     or requested_name ~ '[[:cntrl:]]'
     or (select count(distinct r."skillId") from jsonb_to_recordset(requested_shares) as r ("skillId" uuid))
        <> jsonb_array_length(requested_shares)
     or exists (
       select 1 from jsonb_to_recordset(requested_shares) as r ("skillId" uuid)
       where not exists (select 1 from public.skills s where s.id = r."skillId")
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
    if logged and existing_load_type <> requested_load_type then
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
    insert into public.exercises (id, key, name, load_type, equipment, owner_user_id, variation_of_id)
    values (requested_id, null, requested_name, requested_load_type, requested_equipment, caller, null);
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

create function public.set_custom_exercise_archived(exercise_id uuid, archived boolean)
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
  if set_custom_exercise_archived.archived is null then
    perform private.invalid_exercise();
  end if;
  update public.exercises e
  set archived_at = case when set_custom_exercise_archived.archived then coalesce(e.archived_at, now()) else null end,
      updated_at = now()
  where e.id = set_custom_exercise_archived.exercise_id and e.owner_user_id = caller;
  if not found then
    raise exception 'exercise_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.reorder_pins(exercise_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exercise_ids is null
     or array_position(exercise_ids, null) is not null
     or cardinality(exercise_ids) <> (select count(distinct requested) from unnest(exercise_ids) requested)
     or cardinality(exercise_ids) <> (select count(*) from public.pinned_exercises p where p.user_id = caller)
     or exists (
       select 1 from unnest(exercise_ids) requested
       where not exists (
         select 1 from public.pinned_exercises p where p.user_id = caller and p.exercise_id = requested
       )
     ) then
    raise exception 'invalid_pins' using errcode = 'P0001';
  end if;
  update public.pinned_exercises p
  set position = ordered.ordinality - 1
  from unnest(exercise_ids) with ordinality as ordered (exercise_id, ordinality)
  where p.user_id = caller and p.exercise_id = ordered.exercise_id;
end;
$$;

revoke execute on function public.save_custom_exercise(jsonb) from public, anon;
revoke execute on function public.set_custom_exercise_archived(uuid, boolean) from public, anon;
revoke execute on function public.reorder_pins(uuid[]) from public, anon;
revoke execute on function private.invalid_exercise() from public, anon, authenticated;
grant execute on function public.save_custom_exercise(jsonb) to authenticated;
grant execute on function public.set_custom_exercise_archived(uuid, boolean) to authenticated;
grant execute on function public.reorder_pins(uuid[]) to authenticated;
