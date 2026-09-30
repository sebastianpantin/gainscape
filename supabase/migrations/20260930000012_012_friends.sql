create type public.friendship_status as enum ('pending', 'accepted', 'declined');

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  withdrawn_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint friendship_not_self check (requester_id <> addressee_id),
  constraint responded_unless_pending check ((status = 'pending') = (responded_at is null)),
  constraint withdrawn_only_when_declined check (withdrawn_at is null or status = 'declined')
);

create unique index friendships_one_per_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_by_addressee on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values
  ('username_check_minute', 120, 60),
  ('username_check_anon_minute', 120, 60),
  ('username_check_anon_global_minute', 5000, 60);

create table private.anon_rate_limit_hits (
  bucket text not null references private.rate_limit_rules (bucket) on delete cascade,
  client_key bytea not null,
  window_start timestamptz not null,
  hits int not null check (hits > 0),
  primary key (bucket, client_key, window_start)
);

alter table private.anon_rate_limit_hits enable row level security;

create function private.request_client_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  forwarded text := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  hops text[];
begin
  if forwarded is null then
    return null;
  end if;
  hops := string_to_array(forwarded, ',');
  return nullif(trim(hops[cardinality(hops)]), '');
end;
$$;

create function private.take_anon_rate_limit()
returns void
language plpgsql
set search_path = ''
as $$
declare
  client_ip text := private.request_client_ip();
  bucket_name text := case when client_ip is null then 'username_check_anon_global_minute'
                           else 'username_check_anon_minute' end;
  key bytea := pg_catalog.sha256(convert_to(coalesce(client_ip, ''), 'UTF8'));
  rule_max_hits int;
  rule_window_seconds int;
  window_begin timestamptz;
  taken int;
begin
  select r.max_hits, r.window_seconds into rule_max_hits, rule_window_seconds
  from private.rate_limit_rules r
  where r.bucket = bucket_name;

  window_begin := to_timestamp(floor(extract(epoch from now()) / rule_window_seconds) * rule_window_seconds);

  insert into private.anon_rate_limit_hits as h (bucket, client_key, window_start, hits)
  values (bucket_name, key, window_begin, 1)
  on conflict (bucket, client_key, window_start) do update set hits = h.hits + 1
  returning h.hits into taken;

  delete from private.anon_rate_limit_hits h
  where h.bucket = bucket_name and h.client_key = key and h.window_start < window_begin;

  if taken > rule_max_hits then
    raise exception 'rate_limited' using
      errcode = 'PT429',
      detail = json_build_object(
        'bucket', bucket_name,
        'retryAfterSeconds', greatest(1, ceil(extract(epoch from
          (window_begin + make_interval(secs => rule_window_seconds) - clock_timestamp()))))::int
      )::text;
  end if;
end;
$$;

create function private.max_friends()
returns int
language sql
immutable
set search_path = ''
as $$
  select 200;
$$;

create function private.max_outgoing_requests()
returns int
language sql
immutable
set search_path = ''
as $$
  select 50;
$$;

create function private.unconfirmed_username_hold()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '24 hours';
$$;

create function private.custom_exercise_label()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Custom exercise'::text;
$$;

create function private.account_active(target uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = account_active.target
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;

create function private.release_stale_username(candidate text)
returns void
language sql
set search_path = ''
as $$
  delete from auth.users u
  using public.profiles p
  where p.id = u.id
    and p.username = release_stale_username.candidate
    and u.email_confirmed_at is null
    and u.created_at < now() - private.unconfirmed_username_hold();
$$;

create function private.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(are_friends.a, are_friends.b)
      and greatest(f.requester_id, f.addressee_id) = greatest(are_friends.a, are_friends.b)
  );
$$;

create function private.can_view_user(viewer uuid, target uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select can_view_user.viewer is not null
     and (can_view_user.viewer = can_view_user.target
          or (private.are_friends(can_view_user.viewer, can_view_user.target)
              and private.account_active(can_view_user.target)));
$$;

create function private.collection_counts(target uuid)
returns table (filled_slots int, total_slots int)
language sql
stable
set search_path = ''
as $$
  with visible as (
    select e.id, e.load_type
    from public.exercises e
    where e.owner_user_id = collection_counts.target
       or (e.owner_user_id is null and (not e.requires_unlock or exists (
         select 1 from public.user_unlocks ul where ul.user_id = collection_counts.target and ul.exercise_id = e.id)))
  ),
  counted as (
    select pe.exercise_id from public.pinned_exercises pe where pe.user_id = collection_counts.target
    union
    select r.exercise_id from public.rep_maxes r where r.user_id = collection_counts.target
    union
    select b.exercise_id from public.bodyweight_rep_records b where b.user_id = collection_counts.target
  )
  select
    coalesce(sum(case
      when v.load_type = 'bodyweight' then (exists (
        select 1 from public.bodyweight_rep_records b
        where b.user_id = collection_counts.target and b.exercise_id = v.id))::int
      else least(10, (
        select count(*) from public.rep_maxes r
        where r.user_id = collection_counts.target and r.exercise_id = v.id and r.exact_set_id is not null))::int
    end), 0)::int,
    coalesce(sum(case when v.load_type = 'bodyweight' then 1 else 10 end), 0)::int
  from counted c
  join visible v on v.id = c.exercise_id;
$$;

create function private.public_card(target uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'userId', p.id,
    'username', p.username,
    'displayName', p.display_name,
    'badgeColor', p.badge_color
  )
  from public.profiles p
  where p.id = public_card.target;
$$;

create function private.lock_pair(a uuid, b uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.profiles p where p.id in (lock_pair.a, lock_pair.b) order by p.id for no key update;
end;
$$;

create function private.accepted_friend_count(target uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.friendships f
  where f.status = 'accepted' and accepted_friend_count.target in (f.requester_id, f.addressee_id);
$$;

create function private.outgoing_request_count(target uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.friendships f
  where f.requester_id = outgoing_request_count.target and f.status <> 'accepted' and f.withdrawn_at is null;
$$;

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(new.raw_user_meta_data ->> 'username');
begin
  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = 'check_violation';
  end if;
  perform private.release_stale_username(requested_username);
  if exists (select 1 from public.profiles p where p.username = requested_username) then
    raise exception 'username_taken' using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), requested_username));

  insert into public.profile_private (user_id, timezone)
  values (new.id, private.valid_timezone_or_utc(new.raw_user_meta_data ->> 'timezone'));

  return new;
end;
$$;

create or replace function public.username_available(candidate text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform private.take_anon_rate_limit();
  else
    perform private.take_rate_limit('username_check_minute', auth.uid());
  end if;
  return username_available.candidate ~ '^[a-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles p join auth.users u on u.id = p.id
       where p.username = lower(username_available.candidate)
         and not (u.email_confirmed_at is null and u.created_at < now() - private.unconfirmed_username_hold())
     );
end;
$$;

create function public.send_friend_request(username text)
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
    if private.outgoing_request_count(caller) >= private.max_outgoing_requests() then
      return jsonb_build_object('status', 'limit_reached');
    end if;
    update public.friendships f
    set withdrawn_at = null
    where f.requester_id = caller and f.addressee_id = target;
    return jsonb_build_object('status', 'already_pending');
  end if;
  if found and existing.withdrawn_at is not null then
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

  insert into public.friendships (requester_id, addressee_id) values (caller, target);
  return jsonb_build_object('status', 'sent', 'friend', private.public_card(target));
end;
$$;

create function public.respond_friend_request(requester_id uuid, accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  requester uuid := respond_friend_request.requester_id;
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.lock_pair(caller, requester);

  if not exists (
    select 1 from public.friendships f
    where f.requester_id = requester and f.addressee_id = caller and f.status = 'pending'
  ) or (respond_friend_request.accept and not private.account_active(requester)) then
    raise exception 'request_not_found' using errcode = 'no_data_found';
  end if;

  if respond_friend_request.accept then
    if private.accepted_friend_count(caller) >= private.max_friends()
       or private.accepted_friend_count(requester) >= private.max_friends() then
      raise exception 'friend_limit_reached' using errcode = 'check_violation';
    end if;
    update public.friendships f
    set status = 'accepted', responded_at = now()
    where f.requester_id = requester and f.addressee_id = caller and f.status = 'pending';
    if not found then
      raise exception 'request_not_found' using errcode = 'no_data_found';
    end if;
    return jsonb_build_object('status', 'accepted', 'friend', private.public_card(requester));
  end if;

  update public.friendships f
  set status = 'declined', responded_at = now()
  where f.requester_id = requester and f.addressee_id = caller and f.status = 'pending';
  if not found then
    raise exception 'request_not_found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('status', 'declined', 'friend', private.public_card(requester));
end;
$$;

create function public.remove_friend(other_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.lock_pair(caller, remove_friend.other_id);
  update public.friendships f
  set withdrawn_at = coalesce(f.withdrawn_at, now())
  where f.requester_id = caller and f.addressee_id = remove_friend.other_id and f.status = 'declined';
  delete from public.friendships f
  where ((f.requester_id = caller and f.addressee_id = remove_friend.other_id)
      or (f.requester_id = remove_friend.other_id and f.addressee_id = caller))
    and f.status <> 'declined';
end;
$$;

create function public.list_friends()
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
  if caller is null then
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
    select f.addressee_id, 'outgoing'::text, f.created_at, 2
    from public.friendships f
    where f.requester_id = caller and f.status <> 'accepted' and f.withdrawn_at is null
  ) x
  join public.profiles p on p.id = x.other_id
  where private.account_active(p.id)
  order by x.rank, p.username;
end;
$$;

create function public.get_profile(target uuid)
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
  if caller is null then
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
      from private.collection_counts(p.id) c)
  ) into result
  from public.profiles p
  where p.id = get_profile.target;
  return result;
end;
$$;

create function public.get_collection(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  hide_loads boolean;
  result jsonb;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not private.can_view_user(caller, get_collection.target) then
    return null;
  end if;

  select caller <> p.id and not p.show_weights into hide_loads
  from public.profiles p
  where p.id = get_collection.target;
  if not found then
    return null;
  end if;

  with visible as (
    select e.id, e.name, e.load_type, e.owner_user_id is null as built_in
    from public.exercises e
    where e.owner_user_id = get_collection.target
       or (e.owner_user_id is null and (not e.requires_unlock or exists (
         select 1 from public.user_unlocks ul where ul.user_id = get_collection.target and ul.exercise_id = e.id)))
  ),
  pins as (
    select pe.exercise_id, pe.position from public.pinned_exercises pe where pe.user_id = get_collection.target
  ),
  done as (
    select r.exercise_id from public.rep_maxes r where r.user_id = get_collection.target
    union
    select b.exercise_id from public.bodyweight_rep_records b where b.user_id = get_collection.target
  ),
  counted as (
    select v.id, v.load_type, v.built_in,
           case when v.built_in or caller = get_collection.target then v.name else private.custom_exercise_label() end
             as shown_name,
           pn.position
    from visible v
    left join pins pn on pn.exercise_id = v.id
    where pn.exercise_id is not null or exists (select 1 from done d where d.exercise_id = v.id)
  )
  select jsonb_build_object(
    'userId', get_collection.target,
    'weightsHidden', hide_loads,
    'completion', (
      select jsonb_build_object('filledSlots', cc.filled_slots, 'totalSlots', cc.total_slots)
      from private.collection_counts(get_collection.target) cc),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exerciseId', c.id,
        'name', c.shown_name,
        'loadType', c.load_type,
        'builtIn', c.built_in,
        'pinned', c.position is not null,
        'repMaxes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'reps', r.reps,
            'loadKg', case when hide_loads then null else r.load_kg end,
            'exact', r.exact_set_id is not null) order by r.reps)
          from public.rep_maxes r
          where r.user_id = get_collection.target and r.exercise_id = c.id), '[]'::jsonb),
        'maxReps', (
          select b.max_reps from public.bodyweight_rep_records b
          where b.user_id = get_collection.target and b.exercise_id = c.id))
        order by c.position is null, c.position, lower(c.shown_name), c.id)
      from counted c), '[]'::jsonb),
    'items', jsonb_build_object(
      'found', coalesce((
        select jsonb_agg(jsonb_build_object(
          'itemId', ui.item_id,
          'quantity', ui.quantity,
          'firstObtainedAt', ui.first_obtained_at) order by i.sort_order, i.id)
        from public.user_items ui
        join public.items i on i.id = ui.item_id
        where ui.user_id = get_collection.target), '[]'::jsonb),
      'catalogCount', (select count(*)::int from public.items i where i.retired_at is null))
  ) into result;
  return result;
end;
$$;

revoke execute on function private.max_friends() from public, anon, authenticated;
revoke execute on function private.max_outgoing_requests() from public, anon, authenticated;
revoke execute on function private.unconfirmed_username_hold() from public, anon, authenticated;
revoke execute on function private.custom_exercise_label() from public, anon, authenticated;
revoke execute on function private.account_active(uuid) from public, anon, authenticated;
revoke execute on function private.release_stale_username(text) from public, anon, authenticated;
revoke execute on function private.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.can_view_user(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.collection_counts(uuid) from public, anon, authenticated;
revoke execute on function private.public_card(uuid) from public, anon, authenticated;
revoke execute on function private.lock_pair(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.accepted_friend_count(uuid) from public, anon, authenticated;
revoke execute on function private.outgoing_request_count(uuid) from public, anon, authenticated;
revoke execute on function private.request_client_ip() from public, anon, authenticated;
revoke execute on function private.take_anon_rate_limit() from public, anon, authenticated;

revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.list_friends() from public, anon;
revoke execute on function public.get_profile(uuid) from public, anon;
revoke execute on function public.get_collection(uuid) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.get_profile(uuid) to authenticated;
grant execute on function public.get_collection(uuid) to authenticated;
