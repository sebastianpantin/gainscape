alter table public.sessions
  add column enrollment_id uuid,
  add column program_position jsonb,
  add constraint sessions_enrollment_fkey foreign key (enrollment_id, user_id)
    references public.program_enrollments (id, user_id) on delete set null (enrollment_id),
  add constraint linked_session_has_program_position check (enrollment_id is null or program_position is not null),
  alter column completed_at set default date_trunc('milliseconds', now());

create index sessions_by_enrollment on public.sessions (enrollment_id) where enrollment_id is not null;

alter table public.sets
  add column prescription_ref text,
  add column prescribed_weight_kg numeric(6, 2) check (prescribed_weight_kg between 0 and 2000),
  add column prescribed_reps int check (prescribed_reps between 1 and 100),
  add column prescribed_min_reps int,
  add column prescribed_amrap boolean,
  add constraint prescription_snapshot_is_complete check (
    (prescription_ref is null and prescribed_weight_kg is null and prescribed_reps is null
      and prescribed_min_reps is null and prescribed_amrap is null)
    or (prescription_ref is not null and prescribed_weight_kg is not null and prescribed_reps is not null
      and prescribed_amrap is not null)
  );

create unique index sets_prescription_ref_unique_per_session
  on public.sets (session_id, prescription_ref) where prescription_ref is not null;

create function public.enrollment_facts(enrollment_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'enrollment', jsonb_build_object(
      'id', e.id,
      'template_key', e.template_key,
      'template_version', e.template_version,
      'unit', e.unit,
      'options', e.options,
      'lift_bindings', e.lift_bindings,
      'inputs', e.inputs,
      'rounding', e.rounding,
      'started_at', e.started_at,
      'ended_at', e.ended_at
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', ev.id, 'kind', ev.kind, 'payload', ev.payload, 'effective_at', ev.effective_at)
        order by ev.effective_at, ev.id
      )
      from public.program_enrollment_events ev
      where ev.enrollment_id = e.id
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'completed_at', s.completed_at,
          'program_position', s.program_position,
          'sets', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'ref', st.prescription_ref,
                'exercise_id', st.exercise_id,
                'weight_kg', st.weight_kg,
                'reps', st.reps,
                'effort_input_type', st.effort_input_type,
                'effort_value', st.effort_value,
                'prescribed_weight_kg', st.prescribed_weight_kg,
                'prescribed_reps', st.prescribed_reps,
                'prescribed_min_reps', st.prescribed_min_reps,
                'prescribed_amrap', st.prescribed_amrap
              )
              order by st.position
            )
            from public.sets st
            where st.session_id = s.id and st.duration_s is null
          ), '[]'::jsonb)
        )
        order by s.completed_at, s.id
      )
      from public.sessions s
      where s.enrollment_id = e.id and s.user_id = e.user_id
    ), '[]'::jsonb)
  )
  from public.program_enrollments e
  where e.id = enrollment_facts.enrollment_id and e.user_id = (select auth.uid());
$$;

revoke execute on function public.enrollment_facts(uuid) from public, anon;
grant execute on function public.enrollment_facts(uuid) to authenticated;
