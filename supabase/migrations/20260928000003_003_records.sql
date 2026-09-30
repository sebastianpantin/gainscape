create table public.rep_maxes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  reps int not null check (reps between 1 and 10),
  load_kg numeric(6, 2) not null check (load_kg >= 0),
  set_id uuid references public.sets (id) on delete set null,
  achieved_at timestamptz not null,
  exact_set_id uuid references public.sets (id) on delete set null,
  primary key (user_id, exercise_id, reps)
);

create table public.bodyweight_rep_records (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  max_reps int not null check (max_reps > 0),
  set_id uuid references public.sets (id) on delete set null,
  achieved_at timestamptz not null,
  primary key (user_id, exercise_id)
);

create table public.pinned_exercises (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position int not null check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.rep_maxes enable row level security;
alter table public.bodyweight_rep_records enable row level security;
alter table public.pinned_exercises enable row level security;

grant select on public.rep_maxes, public.bodyweight_rep_records to authenticated;
grant select, insert, delete on public.pinned_exercises to authenticated;
grant update (position) on public.pinned_exercises to authenticated;

create policy "read own rep maxes" on public.rep_maxes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own bodyweight rep records" on public.bodyweight_rep_records
  for select to authenticated using (user_id = (select auth.uid()));

create policy "read own pins" on public.pinned_exercises
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pin visible exercises" on public.pinned_exercises
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.exercises e
      where e.id = exercise_id
        and e.archived_at is null
        and (e.owner_user_id is null or e.owner_user_id = (select auth.uid()))
    )
  );
create policy "reorder own pins" on public.pinned_exercises
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "unpin own pins" on public.pinned_exercises
  for delete to authenticated using (user_id = (select auth.uid()));
