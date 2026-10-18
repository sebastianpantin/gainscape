create or replace function public.get_feed(before_at timestamptz default null, before_id uuid default null, lim int default 30)
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
  from (
    select newest.*
    from private.visible_user_ids(caller) v
    cross join lateral (
      select ue.*
      from public.events ue
      where ue.user_id = v.user_id
        and (get_feed.before_at is null or (ue.occurred_at, ue.id) < (get_feed.before_at, get_feed.before_id))
      order by ue.occurred_at desc, ue.id desc
      limit page_size
    ) newest
    order by newest.occurred_at desc, newest.id desc
    limit page_size
  ) e
  join public.profiles p on p.id = e.user_id
  order by e.occurred_at desc, e.id desc;
end;
$$;

revoke execute on function public.get_feed(timestamptz, uuid, int) from public, anon;
grant execute on function public.get_feed(timestamptz, uuid, int) to authenticated;
