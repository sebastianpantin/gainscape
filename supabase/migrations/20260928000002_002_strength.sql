alter table public.sets alter column rir drop not null;
alter table public.sets add column e1rm_candidate_kg numeric(6, 2) check (e1rm_candidate_kg > 0);
alter table public.sets add column reps_capacity_candidate int check (reps_capacity_candidate > 0);
alter table public.sessions add column derived_balance_version int;
update public.sessions set derived_balance_version = balance_version;
alter table public.sessions alter column derived_balance_version set not null;

create table public.exercise_maxes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  e1rm_kg numeric(6, 2),
  reps_capacity int,
  source_set_id uuid references public.sets (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  constraint exercise_max_has_a_value check (e1rm_kg is not null or reps_capacity is not null)
);

alter table public.exercise_maxes enable row level security;
grant select on public.exercise_maxes to authenticated;
create policy "read own exercise maxes" on public.exercise_maxes
  for select to authenticated using (user_id = (select auth.uid()));

grant update (bodyweight_kg) on public.profile_private to authenticated;
