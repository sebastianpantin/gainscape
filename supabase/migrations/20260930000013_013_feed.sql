alter table public.friendships add column requested_at timestamptz;
update public.friendships f set requested_at = f.created_at;
alter table public.friendships alter column requested_at set default now();
alter table public.friendships alter column requested_at set not null;

create or replace function public.send_friend_request(username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  wanted text := lower(trim(send_friend_request.username));
  target uuid;
  existing public.friendships%rowtype;
  reviving boolean := false;
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.take_rate_limit('friend_request_minute', caller);
  perform private.take_rate_limit('friend_request_day', caller);
  perform private.release_stale_username(wanted);

  select p.id into target
  from public.profiles p
  where p.username = wanted and private.account_active(p.id);
  if target is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if target = caller then
    return jsonb_build_object('status', 'self');
  end if;

  perform private.lock_pair(caller, target);

  select f.* into existing
  from public.friendships f
  where (f.requester_id = caller and f.addressee_id = target)
     or (f.requester_id = target and f.addressee_id = caller);

  if found and existing.status = 'accepted' then
    return jsonb_build_object('status', 'already_friends');
  end if;
  if found and existing.requester_id = caller and existing.withdrawn_at is null then
    return jsonb_build_object('status', 'already_pending');
  end if;
  if found and existing.requester_id = caller then
    reviving := true;
  elsif found and existing.withdrawn_at is not null then
    delete from public.friendships f where f.requester_id = target and f.addressee_id = caller;
  elsif found then
    if private.accepted_friend_count(caller) >= private.max_friends()
       or private.accepted_friend_count(target) >= private.max_friends() then
      return jsonb_build_object('status', 'limit_reached');
    end if;
    update public.friendships f
    set status = 'accepted', responded_at = now()
    where f.requester_id = target and f.addressee_id = caller and f.status <> 'accepted';
    if not found then
      raise exception 'request_not_found' using errcode = 'no_data_found';
    end if;
    return jsonb_build_object('status', 'accepted', 'friend', private.public_card(target));
  end if;

  if private.outgoing_request_count(caller) >= private.max_outgoing_requests()
     or private.accepted_friend_count(caller) >= private.max_friends()
     or private.accepted_friend_count(target) >= private.max_friends() then
    return jsonb_build_object('status', 'limit_reached');
  end if;

  if reviving then
    update public.friendships f
    set withdrawn_at = null, requested_at = now()
    where f.requester_id = caller and f.addressee_id = target;
  else
    insert into public.friendships (requester_id, addressee_id) values (caller, target);
  end if;
  return jsonb_build_object('status', 'sent', 'friend', private.public_card(target));
end;
$$;

create or replace function public.list_friends()
returns table (
  user_id uuid,
  username text,
  display_name text,
  badge_color public.badge_color,
  relation text,
  since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  return query
  select p.id, p.username, p.display_name, p.badge_color, x.relation, x.since
  from (
    select f.requester_id as other_id, 'incoming'::text as relation, f.created_at as since, 0 as rank
    from public.friendships f
    where f.addressee_id = caller and f.status = 'pending'
    union all
    select case when f.requester_id = caller then f.addressee_id else f.requester_id end,
           'friend'::text, f.responded_at, 1
    from public.friendships f
    where f.status = 'accepted' and caller in (f.requester_id, f.addressee_id)
    union all
    select f.addressee_id, 'outgoing'::text, f.requested_at, 2
    from public.friendships f
    where f.requester_id = caller and f.status <> 'accepted' and f.withdrawn_at is null
  ) x
  join public.profiles p on p.id = x.other_id
  where private.account_active(p.id)
  order by x.rank, p.username;
end;
$$;

create table public.reactions (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index reactions_by_user on public.reactions (user_id);

alter table public.reactions enable row level security;

create function private.visible_user_ids(viewer uuid)
returns table (user_id uuid)
language sql
stable
set search_path = ''
as $$
  select visible_user_ids.viewer
  union
  select case when f.requester_id = visible_user_ids.viewer then f.addressee_id else f.requester_id end
  from public.friendships f
  where f.status = 'accepted'
    and visible_user_ids.viewer in (f.requester_id, f.addressee_id)
    and private.account_active(case when f.requester_id = visible_user_ids.viewer then f.addressee_id else f.requester_id end);
$$;

create function private.feed_payload(
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
      select jsonb_build_object(
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

create function public.get_feed(before_at timestamptz default null, before_id uuid default null, lim int default 30)
returns table (
  event_id uuid,
  user_id uuid,
  username text,
  display_name text,
  badge_color public.badge_color,
  type public.event_type,
  occurred_at timestamptz,
  payload jsonb,
  gz_count int,
  gz_given boolean,
  is_own boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  page_size int := least(greatest(coalesce(get_feed.lim, 30), 1), 50);
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if (get_feed.before_at is null) <> (get_feed.before_id is null) then
    raise exception 'invalid_cursor' using errcode = 'invalid_parameter_value';
  end if;

  return query
  select e.id,
         e.user_id,
         p.username,
         p.display_name,
         p.badge_color,
         e.type,
         e.occurred_at,
         private.feed_payload(
           e.type,
           e.payload,
           e.user_id <> caller and not p.show_weights,
           e.user_id <> caller and (not p.show_weights or not p.show_bodyweight)),
         (select count(*)::int from public.reactions r where r.event_id = e.id),
         exists (select 1 from public.reactions r where r.event_id = e.id and r.user_id = caller),
         e.user_id = caller
  from public.events e
  join public.profiles p on p.id = e.user_id
  where e.user_id in (select v.user_id from private.visible_user_ids(caller) v)
    and (get_feed.before_at is null or (e.occurred_at, e.id) < (get_feed.before_at, get_feed.before_id))
  order by e.occurred_at desc, e.id desc
  limit page_size;
end;
$$;

create function public.set_gz(event_id uuid, given boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  owner_id uuid;
  total int;
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.take_rate_limit('gz_minute', caller);

  select e.user_id into owner_id from public.events e where e.id = set_gz.event_id;
  if owner_id is null
     or owner_id = caller
     or not private.are_friends(caller, owner_id)
     or not private.account_active(owner_id) then
    raise exception 'event_not_found' using errcode = 'no_data_found';
  end if;

  if set_gz.given then
    insert into public.reactions (event_id, user_id) values (set_gz.event_id, caller)
    on conflict on constraint reactions_pkey do nothing;
  else
    delete from public.reactions r where r.event_id = set_gz.event_id and r.user_id = caller;
  end if;

  select count(*)::int into total from public.reactions r where r.event_id = set_gz.event_id;
  return jsonb_build_object('eventId', set_gz.event_id, 'given', set_gz.given, 'gzCount', total);
end;
$$;

create function public.get_hiscores()
returns table (
  user_id uuid,
  username text,
  display_name text,
  badge_color public.badge_color,
  is_self boolean,
  skill_xp jsonb,
  collection_filled int,
  collection_total int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;

  return query
  select p.id,
         p.username,
         p.display_name,
         p.badge_color,
         p.id = caller,
         (select jsonb_object_agg(s.key, coalesce(us.xp, 0) order by s.sort_order)
          from public.skills s
          left join public.user_skills us on us.skill_id = s.id and us.user_id = p.id),
         c.filled_slots,
         c.total_slots
  from private.visible_user_ids(caller) v
  join public.profiles p on p.id = v.user_id
  cross join lateral private.collection_counts(p.id) c
  order by p.username;
end;
$$;

revoke execute on function private.visible_user_ids(uuid) from public, anon, authenticated;
revoke execute on function private.feed_payload(public.event_type, jsonb, boolean, boolean) from public, anon, authenticated;

revoke execute on function public.get_feed(timestamptz, uuid, int) from public, anon;
revoke execute on function public.set_gz(uuid, boolean) from public, anon;
revoke execute on function public.get_hiscores() from public, anon;
grant execute on function public.get_feed(timestamptz, uuid, int) to authenticated;
grant execute on function public.set_gz(uuid, boolean) to authenticated;
grant execute on function public.get_hiscores() to authenticated;
