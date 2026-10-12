create or replace function public.publish_program(program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  program_owner uuid;
  program_name text;
  template_key text;
  latest_version int;
  latest_definition jsonb;
  next_version int;
  compiled jsonb;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select p.owner_user_id, p.name into program_owner, program_name
  from public.programs p
  where p.id = publish_program.program_id
  for update;
  if not found or program_owner is distinct from caller then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;

  template_key := 'custom_' || replace(publish_program.program_id::text, '-', '');

  select t.version, t.definition into latest_version, latest_definition
  from public.program_templates t
  where t.key = template_key
  order by t.version desc
  limit 1;

  next_version := coalesce(latest_version, 0) + 1;
  compiled := private.compiled_program_definition(publish_program.program_id, template_key, next_version);

  if latest_definition is not null and latest_definition - 'version' = compiled - 'version' then
    return jsonb_build_object('key', template_key, 'version', latest_version);
  end if;

  insert into public.program_templates (key, version, name, definition, owner_user_id, source_program_id)
  values (template_key, next_version, program_name, compiled, caller, publish_program.program_id);

  delete from public.program_templates t
  where t.key = template_key
    and t.owner_user_id = caller
    and t.version <> next_version
    and not exists (
      select 1 from public.program_enrollments e where e.template_key = t.key and e.template_version = t.version
    );

  return jsonb_build_object('key', template_key, 'version', next_version);
end;
$$;

create or replace function public.enroll_program(enrollment jsonb)
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
  where t.key = enrollment ->> 'templateKey'
    and t.version = (enrollment ->> 'templateVersion')::int
    and (t.owner_user_id is null or (t.owner_user_id = caller and t.source_program_id is not null));
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

create or replace function public.delete_program(program_id uuid)
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
  update public.program_enrollments e set ended_at = now()
  where e.user_id = caller
    and e.ended_at is null
    and exists (
      select 1 from public.program_templates t
      join public.programs pr on pr.id = t.source_program_id
      where t.key = e.template_key
        and t.version = e.template_version
        and t.source_program_id = delete_program.program_id
        and pr.owner_user_id = caller
    );
  delete from public.program_templates t
  where t.source_program_id = delete_program.program_id
    and t.owner_user_id = caller
    and not exists (
      select 1 from public.program_enrollments e where e.template_key = t.key and e.template_version = t.version
    );
  delete from public.programs p where p.id = delete_program.program_id and p.owner_user_id = caller;
  if not found then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;
end;
$$;
