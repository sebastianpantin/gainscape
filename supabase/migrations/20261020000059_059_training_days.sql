create function public.training_days(from_day date, to_day date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'local_date', s.local_date,
        'history_only', s.history_only,
        'xp_by_skill', coalesce(s.summary -> 'xpBySkill', '{}'::jsonb),
        'pr_count', coalesce(jsonb_array_length(s.summary -> 'prs'), 0),
        'drop_count', coalesce(jsonb_array_length(s.summary -> 'drops'), 0),
        'volume_kg', coalesce(
          (select sum(st.effective_load_kg * st.reps)
           from public.sets st
           where st.session_id = s.id and not st.is_warmup),
          0))
      order by s.local_date, s.started_at),
    '[]'::jsonb)
  from public.sessions s
  where s.user_id = (select auth.uid())
    and s.local_date between training_days.from_day and training_days.to_day;
$$;

revoke execute on function public.training_days(date, date) from public, anon;
grant execute on function public.training_days(date, date) to authenticated;
