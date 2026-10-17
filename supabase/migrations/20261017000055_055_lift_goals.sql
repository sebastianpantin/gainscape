create table public.lift_goals (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  target_kg numeric(6, 2) not null constraint lift_goal_target_above_zero check (target_kg > 0),
  reps int not null constraint lift_goal_reps_one_to_ten check (reps between 1 and 10),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index lift_goals_by_exercise on public.lift_goals (exercise_id);

alter table public.lift_goals enable row level security;

grant select, insert, delete on public.lift_goals to authenticated;
grant update (target_kg, reps, target_date) on public.lift_goals to authenticated;

create policy "read own lift goals" on public.lift_goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "goal visible exercises" on public.lift_goals
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.exercises e
      where e.id = exercise_id
        and e.archived_at is null
        and (e.owner_user_id is null or e.owner_user_id = (select auth.uid()))
    )
  );
create policy "edit own lift goals" on public.lift_goals
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own lift goals" on public.lift_goals
  for delete to authenticated using (user_id = (select auth.uid()));

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values ('lift_goal_save_hour', 120, 3600);

create trigger limit_client_lift_goals
before insert or update or delete on public.lift_goals
for each row execute function private.limit_client_write('lift_goal_save_hour', 'exercise_id');

create function private.touch_lift_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.touch_lift_goal() from public, anon, authenticated;

create trigger touch_lift_goal
before update on public.lift_goals
for each row execute function private.touch_lift_goal();

create function public.save_lift_goal(exercise_id uuid, target_kg numeric, reps int, target_date date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.lift_goals (user_id, exercise_id, target_kg, reps, target_date)
  values (caller, save_lift_goal.exercise_id, save_lift_goal.target_kg, save_lift_goal.reps, save_lift_goal.target_date)
  on conflict on constraint lift_goals_pkey do update
  set target_kg = excluded.target_kg, reps = excluded.reps, target_date = excluded.target_date;
end;
$$;

revoke execute on function public.save_lift_goal(uuid, numeric, int, date) from public, anon;
grant execute on function public.save_lift_goal(uuid, numeric, int, date) to authenticated;

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
