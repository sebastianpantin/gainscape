create type public.garmin_activity_outcome as enum ('imported', 'deleted', 'rejected');

create table public.garmin_activities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  outcome public.garmin_activity_outcome not null,
  session_id uuid,
  garmin_type text,
  created_at timestamptz not null default now(),
  primary key (user_id, started_at),
  constraint garmin_activity_starts_on_a_whole_second check (started_at = date_trunc('second', started_at)),
  constraint garmin_activity_type_format check (garmin_type ~ '^[a-z0-9_]{1,60}$'),
  constraint only_an_imported_garmin_activity_has_a_session check (session_id is null or outcome = 'imported'),
  constraint garmin_activities_session_id_fkey foreign key (session_id, user_id)
    references public.sessions (id, user_id) on delete set null (session_id)
);
create unique index garmin_activities_one_per_session on public.garmin_activities (session_id)
  where session_id is not null;

alter table public.garmin_activities enable row level security;

grant select on public.garmin_activities to authenticated;

create policy "read own garmin activities" on public.garmin_activities
  for select to authenticated using (user_id = (select auth.uid()));

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values ('garmin_import_day', 500, 86400);

create or replace function public.reset_account_data(confirmation text)
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
  if confirmation is distinct from 'RESET' then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  perform 1 from public.profiles p where p.id = caller for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('reset_account_hour', caller);
  insert into private.account_resets (transaction_id, user_id) values (pg_catalog.pg_current_xact_id(), caller);

  delete from public.reactions where user_id = caller;
  delete from public.events where user_id = caller;
  delete from public.quest_completion_xp where user_id = caller;
  delete from public.quest_completions where user_id = caller;
  delete from public.quest_progress where user_id = caller;
  delete from public.garmin_activities where user_id = caller;
  insert into public.deleted_sessions (id, user_id, started_at)
  select s.id, s.user_id, s.started_at from public.sessions s where s.user_id = caller
  on conflict (id) do nothing;
  delete from public.sessions where user_id = caller;
  delete from public.user_skills where user_id = caller;
  delete from public.exercise_maxes where user_id = caller;
  delete from public.rep_maxes where user_id = caller;
  delete from public.bodyweight_rep_records where user_id = caller;
  delete from public.cardio_records where user_id = caller;
  delete from public.bodyweight_entries where user_id = caller;
  delete from public.exercise_notes where user_id = caller;
  delete from public.weekly_goals where user_id = caller;
  delete from public.lift_goals where user_id = caller;
  delete from public.program_enrollments where user_id = caller;
  delete from public.user_loadout where user_id = caller;
  delete from public.crafts where user_id = caller;
  delete from public.user_items where user_id = caller;
  delete from public.item_ledger where user_id = caller;
  delete from public.drops where user_id = caller;
  delete from public.drop_luck where user_id = caller;
  delete from public.loot_rolls where user_id = caller;

  delete from private.account_resets r where r.transaction_id = pg_catalog.pg_current_xact_id();
end;
$$;

revoke execute on function public.reset_account_data(text) from public, anon, service_role;
grant execute on function public.reset_account_data(text) to authenticated;
