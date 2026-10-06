create table public.bodyweight_entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  logged_on date not null,
  bodyweight_kg numeric(5, 2) not null check (bodyweight_kg between 20 and 400),
  updated_at timestamptz not null default now(),
  primary key (user_id, logged_on)
);

alter table public.bodyweight_entries enable row level security;
grant select on public.bodyweight_entries to authenticated;
create policy "read own bodyweight entries" on public.bodyweight_entries
  for select to authenticated using (user_id = (select auth.uid()));

create function private.log_bodyweight_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg)
  values (new.user_id, (now() at time zone new.timezone)::date, new.bodyweight_kg)
  on conflict (user_id, logged_on) do update set bodyweight_kg = excluded.bodyweight_kg, updated_at = now();
  return null;
end;
$$;

revoke execute on function private.log_bodyweight_entry() from public, anon, authenticated;

create trigger log_bodyweight_entry
after update of bodyweight_kg on public.profile_private
for each row when (new.bodyweight_kg is not null)
execute function private.log_bodyweight_entry();

insert into public.bodyweight_entries (user_id, logged_on, bodyweight_kg)
select user_id, (updated_at at time zone timezone)::date, bodyweight_kg
from public.profile_private
where bodyweight_kg is not null;

create function public.workout_bodyweights()
returns table (local_date date, bodyweight_kg numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (se.local_date) se.local_date, s.effective_load_kg - s.weight_kg
  from public.sets s
  join public.sessions se on se.id = s.session_id
  join public.exercises e on e.id = s.exercise_id
  where s.user_id = (select auth.uid())
    and not se.history_only
    and e.load_type in ('bodyweight', 'bodyweight_plus')
    and s.effective_load_kg > s.weight_kg
  order by se.local_date, se.started_at desc, s.position;
$$;

revoke execute on function public.workout_bodyweights() from public, anon;
grant execute on function public.workout_bodyweights() to authenticated;
