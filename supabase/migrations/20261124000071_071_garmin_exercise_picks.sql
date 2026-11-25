create table public.garmin_exercise_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint garmin_exercise_pick_category_format check (category ~ '^[a-z0-9_]{1,60}$'),
  constraint garmin_exercise_pick_category_is_known check (category <> 'unknown')
);

alter table public.garmin_exercise_picks enable row level security;

grant select on public.garmin_exercise_picks to authenticated;

create policy "read own garmin exercise picks" on public.garmin_exercise_picks
  for select to authenticated using (user_id = (select auth.uid()));

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
  delete from public.garmin_exercise_picks where user_id = caller;
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
