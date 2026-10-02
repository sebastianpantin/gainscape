create table public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_key text not null,
  template_version int not null,
  unit text not null check (unit in ('kg', 'lb')),
  options jsonb not null check (jsonb_typeof(options) = 'object'),
  lift_bindings jsonb not null check (jsonb_typeof(lift_bindings) = 'object'),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  rounding jsonb not null check (jsonb_typeof(rounding) = 'object'),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (template_key, template_version) references public.program_templates (key, version),
  unique (id, user_id)
);

create unique index program_enrollments_one_active_per_user
  on public.program_enrollments (user_id) where ended_at is null;

create index program_enrollments_by_owner_and_start on public.program_enrollments (user_id, started_at);

create table public.program_enrollment_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments (id) on delete cascade,
  kind text not null check (kind in ('set_reference', 'skip_day', 'jump_to')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  effective_at timestamptz not null default now()
);

create index program_enrollment_events_by_enrollment
  on public.program_enrollment_events (enrollment_id, effective_at, id);

create function private.forbid_program_enrollment_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'program_enrollment_events_are_append_only' using errcode = 'P0001';
end;
$$;

revoke execute on function private.forbid_program_enrollment_event_changes() from public, anon, authenticated;

create trigger program_enrollment_events_are_append_only
before update on public.program_enrollment_events
for each row execute function private.forbid_program_enrollment_event_changes();

alter table public.program_enrollments enable row level security;
alter table public.program_enrollment_events enable row level security;

grant select on public.program_enrollments, public.program_enrollment_events to authenticated;

create policy "read own program enrollments" on public.program_enrollments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read events of own program enrollments" on public.program_enrollment_events
  for select to authenticated using (
    exists (
      select 1 from public.program_enrollments e
      where e.id = enrollment_id and e.user_id = (select auth.uid())
    )
  );

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values
  ('program_enroll_hour', 10, 3600),
  ('program_adjust_hour', 60, 3600);

create trigger limit_client_program_enrollments
before insert on public.program_enrollments
for each row execute function private.limit_client_write('program_enroll_hour', 'id');

create trigger limit_client_program_enrollment_events
before insert on public.program_enrollment_events
for each row execute function private.limit_client_write('program_adjust_hour', 'id');

create function private.is_valid_enrollment(definition jsonb, enrollment jsonb)
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
           or given_input.value::text::numeric > 1000 then
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

create function private.is_valid_program_position(schedule jsonb, program_position jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  given_keys text[];
  day_is_known boolean;
begin
  if jsonb_typeof(program_position) is distinct from 'object' then
    return false;
  end if;
  given_keys := array(select k from jsonb_object_keys(program_position) k order by k collate "C");
  day_is_known := jsonb_typeof(program_position -> 'day') = 'string'
    and exists (
      select 1 from jsonb_array_elements(schedule -> 'days') d where d ->> 'key' = program_position ->> 'day'
    );
  case schedule ->> 'kind'
    when 'cycle' then
      return given_keys = array['cycle', 'day', 'week']
        and private.is_whole_number_between(
          program_position -> 'cycle', 1, ceil(520::numeric / (schedule ->> 'weeksPerCycle')::int)::int
        )
        and private.is_whole_number_between(program_position -> 'week', 1, (schedule ->> 'weeksPerCycle')::int)
        and day_is_known;
    when 'weekly' then
      return given_keys = array['day', 'week']
        and private.is_whole_number_between(program_position -> 'week', 1, 520)
        and day_is_known;
    when 'rotation' then
      return given_keys = array['index']
        and private.is_whole_number_between(
          program_position -> 'index', 0, 520 * jsonb_array_length(schedule -> 'days') - 1
        );
    else
      return false;
  end case;
end;
$$;

create function public.enroll_program(enrollment jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  template_definition jsonb;
  enrolled_id uuid;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(enrollment) is distinct from 'object'
     or jsonb_typeof(enrollment -> 'templateKey') is distinct from 'string'
     or not private.is_whole_number_between(enrollment -> 'templateVersion', 1, 2147483647) then
    raise exception 'invalid_enrollment' using errcode = 'P0001';
  end if;

  select t.definition into template_definition
  from public.program_templates t
  where t.key = enrollment ->> 'templateKey' and t.version = (enrollment ->> 'templateVersion')::int;
  if not found then
    raise exception 'unknown_template' using errcode = 'P0001';
  end if;

  if not private.is_valid_enrollment(template_definition, enrollment) then
    raise exception 'invalid_enrollment' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_each(enrollment -> 'bindings') b
    where jsonb_typeof(b.value) = 'string'
      and not exists (
        select 1 from public.exercises e
        where e.id = (b.value #>> '{}')::uuid and (e.owner_user_id is null or e.owner_user_id = caller)
      )
  ) then
    raise exception 'unknown_exercise' using errcode = 'P0001';
  end if;

  perform 1 from public.profiles p where p.id = caller for update;

  update public.program_enrollments e set ended_at = now()
  where e.user_id = caller and e.ended_at is null;

  insert into public.program_enrollments
    (user_id, template_key, template_version, unit, options, lift_bindings, inputs, rounding)
  values (
    caller,
    enrollment ->> 'templateKey',
    (enrollment ->> 'templateVersion')::int,
    enrollment ->> 'unit',
    enrollment -> 'options',
    enrollment -> 'bindings',
    enrollment -> 'inputs',
    jsonb_build_object(
      'increment', enrollment -> 'rounding' -> 'increment',
      'mode', enrollment -> 'rounding' -> 'mode',
      'barWeight', enrollment -> 'rounding' -> 'barWeight'
    )
  )
  returning id into enrolled_id;

  return enrolled_id;
end;
$$;

create function public.adjust_enrollment(enrollment_id uuid, event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  template_definition jsonb;
  enrollment_ended_at timestamptz;
  event_payload jsonb;
  event_id uuid;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select t.definition, e.ended_at into template_definition, enrollment_ended_at
  from public.program_enrollments e
  join public.program_templates t on t.key = e.template_key and t.version = e.template_version
  where e.id = adjust_enrollment.enrollment_id and e.user_id = caller;
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
       or (event ->> 'value')::numeric > 1000 then
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

create function public.end_enrollment(enrollment_id uuid)
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

  perform 1 from public.program_enrollments e
  where e.id = end_enrollment.enrollment_id and e.user_id = caller
  for update;
  if not found then
    raise exception 'enrollment_not_found' using errcode = 'P0001';
  end if;

  update public.program_enrollments e set ended_at = now()
  where e.id = end_enrollment.enrollment_id and e.ended_at is null;
  if found then
    perform private.take_rate_limit('program_adjust_hour', caller);
  end if;
end;
$$;

revoke execute on function private.is_valid_enrollment(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.is_valid_program_position(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.enroll_program(jsonb) from public, anon;
revoke execute on function public.adjust_enrollment(uuid, jsonb) from public, anon;
revoke execute on function public.end_enrollment(uuid) from public, anon;
grant execute on function public.enroll_program(jsonb) to authenticated;
grant execute on function public.adjust_enrollment(uuid, jsonb) to authenticated;
grant execute on function public.end_enrollment(uuid) to authenticated;
