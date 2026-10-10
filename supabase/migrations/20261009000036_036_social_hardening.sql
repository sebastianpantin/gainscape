update public.profiles p
set display_name = p.username
where p.display_name ~ '[[:cntrl:]\u0080-\u009f‪-‮⁦-⁩]'
   or p.display_name !~ '[^    -​    　﻿]';

alter table public.profiles add constraint profiles_display_name_visible check (
  display_name !~ '[[:cntrl:]\u0080-\u009f‪-‮⁦-⁩]'
  and display_name ~ '[^    -​    　﻿]'
);

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(new.raw_user_meta_data ->> 'username');
  requested_display_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = 'check_violation';
  end if;
  perform private.release_stale_username(requested_username);
  if exists (select 1 from public.profiles p where p.username = requested_username) then
    raise exception 'username_taken' using errcode = 'unique_violation';
  end if;

  begin
    insert into public.profiles (id, username, display_name)
    values (new.id, requested_username, coalesce(requested_display_name, requested_username));
  exception when check_violation then
    insert into public.profiles (id, username, display_name)
    values (new.id, requested_username, requested_username);
  end;

  insert into public.profile_private (user_id, timezone)
  values (new.id, private.valid_timezone_or_utc(new.raw_user_meta_data ->> 'timezone'));

  return new;
end;
$$;

create or replace function private.accepted_friend_count(target uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.friendships f
  where f.status = 'accepted'
    and accepted_friend_count.target in (f.requester_id, f.addressee_id)
    and private.account_active(
      case when f.requester_id = accepted_friend_count.target then f.addressee_id else f.requester_id end);
$$;

create or replace function private.outgoing_request_count(target uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.friendships f
  where f.requester_id = outgoing_request_count.target
    and f.status <> 'accepted'
    and f.withdrawn_at is null
    and private.account_active(f.addressee_id);
$$;

create or replace function public.send_friend_request(username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  wanted text := lower(regexp_replace(trim(send_friend_request.username), '^@', ''));
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

create or replace function private.cap_pins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = new.user_id for no key update;
  if (select count(*) from public.pinned_exercises p where p.user_id = new.user_id) >= 50 then
    raise exception 'too_many_pins' using errcode = 'P0001';
  end if;
  new.position := coalesce(
    (select max(p.position) + 1 from public.pinned_exercises p where p.user_id = new.user_id), 0);
  return new;
end;
$$;

create or replace function public.get_collection(target uuid)
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
  if caller is null or not private.account_active(caller) then
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
    where e.modality = 'lift'
      and (e.owner_user_id = get_collection.target
        or e.owner_user_id is null)
  ),
  pins as (
    select pe.exercise_id, pe.position, pe.created_at
    from public.pinned_exercises pe
    where pe.user_id = get_collection.target
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
           pn.position,
           pn.created_at as pinned_at
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
        order by c.position is null, c.position, c.pinned_at,
                 case when c.position is null then lower(c.shown_name) end, c.id)
      from counted c), '[]'::jsonb),
    'items', jsonb_build_object(
      'found', coalesce((
        select jsonb_agg(jsonb_build_object(
          'itemId', ui.item_id,
          'quantity', ui.quantity,
          'firstObtainedAt', ui.first_obtained_at) order by i.sort_order, i.id)
        from public.user_items ui
        join public.items i on i.id = ui.item_id
        where ui.user_id = get_collection.target and i.retired_at is null), '[]'::jsonb),
      'catalogCount', (select count(*)::int from public.items i where i.retired_at is null))
  ) into result;
  return result;
end;
$$;
