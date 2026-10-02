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
