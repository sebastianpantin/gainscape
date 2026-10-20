create function public.rarest_recent_drop(since timestamptz)
returns setof public.items
language sql
stable
security invoker
set search_path = ''
as $$
  select i.*
  from public.drops d
  join public.items i on i.id = d.item_id
  where d.user_id = (select auth.uid())
    and d.revoked_at is null
    and d.created_at >= rarest_recent_drop.since
  order by i.rarity desc, d.created_at desc, d.id desc
  limit 1;
$$;

revoke execute on function public.rarest_recent_drop(timestamptz) from public, anon;
grant execute on function public.rarest_recent_drop(timestamptz) to authenticated;
