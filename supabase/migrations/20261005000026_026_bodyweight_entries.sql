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
