create table public.quests (
  id uuid primary key,
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 280),
  quest_points int not null check (quest_points between 1 and 10),
  sort_order int not null,
  definition jsonb not null constraint quest_definition_is_object check (jsonb_typeof(definition) = 'object'),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index quests_name_unique on public.quests (lower(name));

create table public.quest_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id uuid not null references public.quests (id),
  started_at timestamptz not null default date_trunc('milliseconds', now()),
  step_index int not null default 0 check (step_index >= 0),
  step_progress numeric(14, 2) not null default 0 check (step_progress >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);

create table public.quest_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id uuid not null references public.quests (id),
  started_at timestamptz not null,
  completed_at timestamptz not null default date_trunc('milliseconds', now()),
  session_id uuid,
  anchor_started_at timestamptz not null,
  anchor_session_id uuid not null,
  quest_points int not null check (quest_points between 1 and 10),
  primary key (user_id, quest_id),
  constraint quest_completions_session_id_fkey foreign key (session_id, user_id)
    references public.sessions (id, user_id) on delete set null (session_id)
);

create table public.quest_completion_xp (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id uuid not null,
  skill_id uuid not null references public.skills (id),
  xp int not null check (xp > 0),
  primary key (user_id, quest_id, skill_id),
  constraint quest_completion_xp_completion_fkey foreign key (user_id, quest_id)
    references public.quest_completions (user_id, quest_id) on delete cascade
);

create function private.allow_only_session_unlink()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.session_id is not null and new.session_id is null
     and (to_jsonb(new) - 'session_id') = (to_jsonb(old) - 'session_id') then
    return new;
  end if;
  raise exception 'append_only' using errcode = 'restrict_violation', detail = tg_table_name;
end;
$$;

revoke execute on function private.allow_only_session_unlink() from public, anon, authenticated;

create trigger quest_completions_are_append_only
before delete on public.quest_completions
for each row execute function private.forbid_append_only_changes();

create trigger quest_completions_only_unlink_sessions
before update on public.quest_completions
for each row execute function private.allow_only_session_unlink();

create trigger quest_completions_are_never_truncated
before truncate on public.quest_completions
for each statement execute function private.forbid_append_only_truncate();

create trigger quest_completion_xp_is_append_only
before update or delete on public.quest_completion_xp
for each row execute function private.forbid_append_only_changes();

create trigger quest_completion_xp_is_never_truncated
before truncate on public.quest_completion_xp
for each statement execute function private.forbid_append_only_truncate();

alter table public.quests enable row level security;
alter table public.quest_progress enable row level security;
alter table public.quest_completions enable row level security;
alter table public.quest_completion_xp enable row level security;

grant select on public.quests, public.quest_progress, public.quest_completions, public.quest_completion_xp
  to authenticated;

create policy "read quests" on public.quests for select to authenticated using (true);
create policy "read own quest progress" on public.quest_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own quest completions" on public.quest_completions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own quest completion xp" on public.quest_completion_xp
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.events
  alter column session_id drop not null,
  drop constraint events_event_key_check,
  add constraint events_event_key_check check (event_key ~ '^(pr|level|drop|quest):[a-z0-9_-]+$'),
  add constraint events_quest_has_no_session check ((type = 'quest') = (session_id is null));

create unique index events_unique_sessionless_key on public.events (user_id, event_key) where session_id is null;

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values
  ('quest_start_hour', 30, 3600);

create or replace function private.feed_payload(
  event_type public.event_type,
  stored jsonb,
  hide_loads boolean,
  hide_total boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case feed_payload.event_type
    when 'pr' then (
      select case when feed_payload.stored ->> 'kind' = 'cardio' then
          jsonb_build_object(
            'exerciseId', feed_payload.stored -> 'exerciseId',
            'exerciseName', case when x.owner_user_id is null then x.name else private.custom_exercise_label() end,
            'kind', 'cardio',
            'paceUnit', x.pace_unit,
            'recordKinds', feed_payload.stored -> 'recordKinds',
            'countedWorkS', feed_payload.stored -> 'countedWorkS',
            'previousCountedWorkS', feed_payload.stored -> 'previousCountedWorkS',
            'weightsHidden', feed_payload.hide_loads)
          || case when feed_payload.hide_loads then '{}'::jsonb else jsonb_build_object(
            'distanceM', feed_payload.stored -> 'distanceM',
            'previousDistanceM', feed_payload.stored -> 'previousDistanceM',
            'paceSPerKm', feed_payload.stored -> 'paceSPerKm',
            'previousPaceSPerKm', feed_payload.stored -> 'previousPaceSPerKm') end
        else
          jsonb_build_object(
            'exerciseId', feed_payload.stored -> 'exerciseId',
            'exerciseName', case when x.owner_user_id is null then x.name else private.custom_exercise_label() end,
            'loadType', x.load_type,
            'kind', feed_payload.stored -> 'kind',
            'reps', feed_payload.stored -> 'reps',
            'previousReps', feed_payload.stored -> 'previousReps',
            'weightsHidden', feed_payload.hide_loads)
          || case when feed_payload.hide_loads then '{}'::jsonb else jsonb_build_object(
            'loadKg', feed_payload.stored -> 'loadKg',
            'previousLoadKg', feed_payload.stored -> 'previousLoadKg') end
          || case when feed_payload.hide_total or jsonb_typeof(feed_payload.stored -> 'totalLoadKg') is distinct from 'number'
               then '{}'::jsonb
               else jsonb_build_object('totalLoadKg', feed_payload.stored -> 'totalLoadKg') end
        end
      from public.exercises x
      where x.id = (feed_payload.stored ->> 'exerciseId')::uuid)
    when 'drop' then (
      select jsonb_build_object(
        'dropId', feed_payload.stored -> 'dropId',
        'itemId', i.id,
        'itemKey', i.key,
        'itemName', i.name,
        'iconKey', i.icon_key,
        'tier', i.tier,
        'rarity', i.rarity,
        'quantity', feed_payload.stored -> 'quantity',
        'source', feed_payload.stored -> 'source')
      from public.items i
      where i.id = (feed_payload.stored ->> 'itemId')::uuid)
    when 'quest' then jsonb_build_object(
      'questId', feed_payload.stored -> 'questId',
      'questKey', feed_payload.stored -> 'questKey',
      'questName', coalesce(
        (select to_jsonb(q.name) from public.quests q where q.id = (feed_payload.stored ->> 'questId')::uuid),
        feed_payload.stored -> 'name'),
      'questPoints', feed_payload.stored -> 'questPoints',
      'levelUps', coalesce((
        select jsonb_agg(jsonb_build_object(
            'skill', s.key,
            'skillName', s.name,
            'from', l.level_up -> 'from',
            'to', l.level_up -> 'to') order by l.position)
        from jsonb_array_elements(coalesce(feed_payload.stored -> 'levelUps', '[]'::jsonb))
          with ordinality as l (level_up, position)
        join public.skills s on s.key = l.level_up ->> 'skill'), '[]'::jsonb))
    else (
      select jsonb_build_object(
        'skill', s.key,
        'skillName', s.name,
        'from', feed_payload.stored -> 'from',
        'to', feed_payload.stored -> 'to')
      from public.skills s
      where s.key = feed_payload.stored ->> 'skill')
  end;
$$;

revoke execute on function private.feed_payload(public.event_type, jsonb, boolean, boolean) from public, anon, authenticated;

create or replace function public.get_profile(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not private.can_view_user(caller, get_profile.target) then
    return null;
  end if;

  select jsonb_build_object(
    'userId', p.id,
    'username', p.username,
    'displayName', p.display_name,
    'bio', p.bio,
    'trainingFocus', p.training_focus,
    'trainingSince', p.training_since,
    'badgeColor', p.badge_color,
    'joinedAt', p.created_at,
    'showWeights', p.show_weights,
    'relation', case when p.id = caller then 'self' else 'friend' end,
    'friendsSince', (
      select f.responded_at from public.friendships f
      where p.id <> caller and f.status = 'accepted'
        and ((f.requester_id = caller and f.addressee_id = p.id) or (f.requester_id = p.id and f.addressee_id = caller))),
    'skillXp', (
      select jsonb_object_agg(s.key, coalesce(us.xp, 0) order by s.sort_order)
      from public.skills s
      left join public.user_skills us on us.skill_id = s.id and us.user_id = p.id),
    'collection', (
      select jsonb_build_object('filledSlots', c.filled_slots, 'totalSlots', c.total_slots)
      from private.collection_counts(p.id) c),
    'questPoints', (
      select coalesce(sum(qc.quest_points), 0)::int from public.quest_completions qc where qc.user_id = p.id)
  ) into result
  from public.profiles p
  where p.id = get_profile.target;
  return result;
end;
$$;

revoke execute on function public.get_profile(uuid) from public, anon;
grant execute on function public.get_profile(uuid) to authenticated;

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
