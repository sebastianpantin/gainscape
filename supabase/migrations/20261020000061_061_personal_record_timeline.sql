create function public.personal_record_timeline(before_at timestamptz, before_id uuid, page_size int)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with page as (
    select s.id, s.started_at, s.local_date, s.summary -> 'prs' as prs
    from public.sessions s
    where s.user_id = (select auth.uid())
      and not s.history_only
      and s.summary -> 'prs' <> '[]'::jsonb
      and (personal_record_timeline.before_at is null
        or (s.started_at, s.id) < (personal_record_timeline.before_at, personal_record_timeline.before_id))
    order by s.started_at desc, s.id desc
    limit least(greatest(personal_record_timeline.page_size, 1), 50)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('session_id', p.id, 'started_at', p.started_at, 'local_date', p.local_date, 'record', r.record)
      order by p.started_at desc, p.id desc, r.position),
    '[]'::jsonb)
  from page p
  cross join lateral jsonb_array_elements(p.prs) with ordinality as r(record, position);
$$;

revoke execute on function public.personal_record_timeline(timestamptz, uuid, int) from public, anon;
grant execute on function public.personal_record_timeline(timestamptz, uuid, int) to authenticated;
