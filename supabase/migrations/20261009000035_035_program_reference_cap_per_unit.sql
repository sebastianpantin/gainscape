create function private.max_program_reference(unit text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case unit when 'lb' then 2205 else 1000 end::numeric;
$$;

revoke execute on function private.max_program_reference(text) from public, anon, authenticated;

create or replace function private.is_valid_enrollment(definition jsonb, enrollment jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  rounding jsonb := enrollment -> 'rounding';
  chosen record;
  declared jsonb;
  input_decl jsonb;
  lift text;
  given jsonb;
  given_input record;
  binding record;
begin
  if jsonb_typeof(enrollment -> 'unit') is distinct from 'string'
     or enrollment ->> 'unit' not in ('kg', 'lb')
     or jsonb_typeof(enrollment -> 'options') is distinct from 'object'
     or jsonb_typeof(enrollment -> 'bindings') is distinct from 'object'
     or jsonb_typeof(enrollment -> 'inputs') is distinct from 'object'
     or jsonb_typeof(rounding) is distinct from 'object' then
    return false;
  end if;

  if jsonb_typeof(rounding -> 'increment') is distinct from 'number'
     or (rounding ->> 'increment')::numeric <= 0
     or jsonb_typeof(rounding -> 'mode') is distinct from 'string'
     or rounding ->> 'mode' not in ('nearest', 'down')
     or jsonb_typeof(rounding -> 'barWeight') is distinct from 'number'
     or (rounding ->> 'barWeight')::numeric < 0 then
    return false;
  end if;

  for chosen in select key, value from jsonb_each(enrollment -> 'options') loop
    select o into declared from jsonb_array_elements(definition -> 'options') o where o ->> 'key' = chosen.key;
    if declared is null then
      return false;
    end if;
    if declared ->> 'kind' = 'choice'
       and not exists (select 1 from jsonb_array_elements(declared -> 'values') v where v = chosen.value) then
      return false;
    end if;
    if declared ->> 'kind' = 'choice'
       and jsonb_typeof(declared -> 'onlyForUnit' -> (chosen.value #>> '{}')) = 'string'
       and declared -> 'onlyForUnit' ->> (chosen.value #>> '{}') <> enrollment ->> 'unit' then
      return false;
    end if;
    if declared ->> 'kind' = 'number'
       and (jsonb_typeof(chosen.value) is distinct from 'number'
            or chosen.value::text::numeric < (declared ->> 'min')::numeric
            or chosen.value::text::numeric > (declared ->> 'max')::numeric) then
      return false;
    end if;
  end loop;

  for input_decl in select value from jsonb_array_elements(definition -> 'inputs') loop
    for lift in select value from jsonb_array_elements_text(input_decl -> 'lifts') loop
      given := enrollment -> 'inputs' -> lift;
      if jsonb_typeof(given) is distinct from 'object'
         or not exists (select 1 from jsonb_object_keys(given) k where input_decl -> 'kinds' ? k) then
        return false;
      end if;
      for given_input in select key, value from jsonb_each(given) loop
        if not (input_decl -> 'kinds' ? given_input.key)
           or jsonb_typeof(given_input.value) is distinct from 'number'
           or given_input.value::text::numeric <= 0
           or given_input.value::text::numeric > private.max_program_reference(enrollment ->> 'unit') then
          return false;
        end if;
      end loop;
    end loop;
  end loop;

  if exists (
    select 1 from jsonb_object_keys(enrollment -> 'inputs') given_lift
    where not exists (
      select 1 from jsonb_array_elements(definition -> 'inputs') declared_input
      where declared_input -> 'lifts' ? given_lift
    )
  ) then
    return false;
  end if;

  for binding in select key, value from jsonb_each(enrollment -> 'bindings') loop
    if not exists (select 1 from jsonb_array_elements(definition -> 'lifts') l where l ->> 'key' = binding.key) then
      return false;
    end if;
    if jsonb_typeof(binding.value) <> 'null'
       and (jsonb_typeof(binding.value) <> 'string' or binding.value #>> '{}' !~ uuid_pattern) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.adjust_enrollment(enrollment_id uuid, event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  template_definition jsonb;
  enrollment_ended_at timestamptz;
  enrollment_unit text;
  event_payload jsonb;
  event_id uuid;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select t.definition, e.ended_at, e.unit into template_definition, enrollment_ended_at, enrollment_unit
  from public.program_enrollments e
  join public.program_templates t on t.key = e.template_key and t.version = e.template_version
  where e.id = adjust_enrollment.enrollment_id and e.user_id = caller
  for update of e;
  if not found then
    raise exception 'enrollment_not_found' using errcode = 'P0001';
  end if;
  if enrollment_ended_at is not null then
    raise exception 'enrollment_ended' using errcode = 'P0001';
  end if;

  if jsonb_typeof(event) is distinct from 'object' then
    raise exception 'invalid_event' using errcode = 'P0001';
  end if;

  if event ->> 'kind' = 'set_reference' then
    if jsonb_typeof(event -> 'lift') is distinct from 'string'
       or not exists (
         select 1 from jsonb_array_elements(template_definition -> 'inputs') declared_input
         where declared_input -> 'lifts' ? (event ->> 'lift')
       )
       or jsonb_typeof(event -> 'var') is distinct from 'string'
       or not (template_definition -> 'referenceVars' ? (event ->> 'var'))
       or jsonb_typeof(event -> 'value') is distinct from 'number'
       or (event ->> 'value')::numeric <= 0
       or (event ->> 'value')::numeric > private.max_program_reference(enrollment_unit) then
      raise exception 'invalid_event' using errcode = 'P0001';
    end if;
    event_payload := jsonb_build_object('lift', event -> 'lift', 'var', event -> 'var', 'value', event -> 'value');
  elsif event ->> 'kind' in ('skip_day', 'jump_to') then
    if not private.is_valid_program_position(template_definition -> 'schedule', event -> 'position') then
      raise exception 'invalid_event' using errcode = 'P0001';
    end if;
    event_payload := jsonb_build_object('position', event -> 'position');
  else
    raise exception 'invalid_event' using errcode = 'P0001';
  end if;

  insert into public.program_enrollment_events (enrollment_id, kind, payload)
  values (adjust_enrollment.enrollment_id, event ->> 'kind', event_payload)
  returning id into event_id;

  return event_id;
end;
$$;
