alter table public.program_templates
  add column owner_user_id uuid references public.profiles (id) on delete cascade,
  add column source_program_id uuid references public.programs (id) on delete set null,
  add column created_at timestamptz not null default now(),
  add constraint only_custom_templates_have_an_owner check ((owner_user_id is null) = (key !~ '^custom_'));

create index program_templates_by_owner on public.program_templates (owner_user_id) where owner_user_id is not null;
create index program_templates_by_source_program
  on public.program_templates (source_program_id) where source_program_id is not null;

drop policy "read program templates" on public.program_templates;
create policy "read catalog and own program templates" on public.program_templates
  for select to authenticated using (owner_user_id is null or owner_user_id = (select auth.uid()));

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values ('program_publish_hour', 20, 3600);

create trigger limit_client_program_publishes
before insert on public.program_templates
for each row execute function private.limit_client_write('program_publish_hour', 'key');

create function private.compiled_program_definition(program_id uuid, template_key text, template_version int)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with planned as (
    select d.position as day_position,
           x.position as slot_position,
           'd' || d.position || '_' || x.position as slot_id,
           'x_' || replace(x.exercise_id::text, '-', '') as lift,
           e.name as exercise_name,
           e.equipment = 'barbell' as barbell,
           x.target_sets,
           x.target_reps_min,
           x.target_reps_max,
           case when e.load_type = 'external' then x.progression else 'none' end as progression,
           trim_scale(x.increment_kg) as increment_kg,
           trim_scale(x.increment_lb) as increment_lb
    from public.program_days d
    join public.program_day_exercises x on x.day_id = d.id
    join public.exercises e on e.id = x.exercise_id
    where d.program_id = compiled_program_definition.program_id
  ),
  lifts as (
    select p.lift,
           p.exercise_name,
           p.barbell,
           min(p.day_position * 100 + p.slot_position) as first_seen,
           bool_or(p.progression <> 'none') as weighted,
           bool_or(p.progression = 'linear') as linear
    from planned p
    group by p.lift, p.exercise_name, p.barbell
  ),
  first_linear_slots as (
    select distinct on (p.lift) p.lift, p.increment_kg, p.increment_lb
    from planned p
    where p.progression = 'linear'
    order by p.lift, p.day_position, p.slot_position
  )
  select jsonb_build_object(
    'key', compiled_program_definition.template_key,
    'version', compiled_program_definition.template_version,
    'name', (select pr.name from public.programs pr where pr.id = compiled_program_definition.program_id),
    'source', '[]'::jsonb,
    'lifts', coalesce((
      select jsonb_agg(
        jsonb_build_object('key', l.lift, 'name', l.exercise_name, 'barbell', l.barbell) order by l.first_seen
      )
      from lifts l
    ), '[]'::jsonb),
    'inputs', coalesce((
      select jsonb_build_array(
        jsonb_build_object('lifts', jsonb_agg(l.lift order by l.first_seen), 'kinds', '["workingWeight"]'::jsonb)
      )
      from lifts l
      where l.weighted
      having count(*) > 0
    ), '[]'::jsonb),
    'referenceVars', '["workingWeight"]'::jsonb,
    'initial', '[{"kind": "copy", "var": "workingWeight", "from": "workingWeight"}]'::jsonb,
    'options', '[]'::jsonb,
    'schedule', jsonb_build_object(
      'kind', 'rotation',
      'days', (
        select jsonb_agg(
          jsonb_build_object(
            'key', 'd' || d.position,
            'name', d.name,
            'slots', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', p.slot_id,
                  'lift', p.lift,
                  'role', 'main',
                  'scheme', jsonb_build_object(
                    'kind', 'repeat',
                    'count', p.target_sets,
                    'reps', p.target_reps_min,
                    'load', case
                      when p.progression = 'none' then '{"kind": "lastLogged"}'::jsonb
                      else '{"kind": "pct", "pct": 1, "of": "workingWeight"}'::jsonb
                    end
                  ) || case
                    when p.target_reps_max <> p.target_reps_min then jsonb_build_object('maxReps', p.target_reps_max)
                    else '{}'::jsonb
                  end
                )
                order by p.slot_position
              )
              from planned p
              where p.day_position = d.position
            ), '[]'::jsonb)
          )
          order by d.position
        )
        from public.program_days d
        where d.program_id = compiled_program_definition.program_id
      )
    ),
    'progression', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'lift', l.lift,
          'var', 'workingWeight',
          'trigger', 'afterSession',
          'judgedSlots', (
            select jsonb_agg(p.slot_id order by p.day_position, p.slot_position)
            from planned p
            where p.lift = l.lift and p.progression = 'linear'
          ),
          'onMet', jsonb_build_array(
            jsonb_build_object('kind', 'increment', 'by', jsonb_build_object('kg', f.increment_kg, 'lb', f.increment_lb))
          ),
          'onMiss', '[{"kind": "hold"}]'::jsonb
        )
        order by l.first_seen
      )
      from lifts l
      join first_linear_slots f on f.lift = l.lift
      where l.linear
    ), '[]'::jsonb)
  );
$$;

create function public.publish_program(program_id uuid)
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
    and (t.owner_user_id is null or t.owner_user_id = caller);
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

revoke execute on function private.compiled_program_definition(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.publish_program(uuid) from public, anon;
revoke execute on function public.enroll_program(jsonb) from public, anon;
grant execute on function public.publish_program(uuid) to authenticated;
grant execute on function public.enroll_program(jsonb) to authenticated;
