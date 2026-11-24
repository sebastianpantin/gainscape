create table public.garmin_activity_types (
  key text primary key,
  exercise_id uuid not null references public.exercises (id),
  constraint garmin_activity_type_key_format check (key ~ '^[a-z0-9_]+$')
);

alter table public.garmin_activity_types enable row level security;

grant select on public.garmin_activity_types to authenticated;

create policy "read garmin activity types" on public.garmin_activity_types
  for select to authenticated using (true);
