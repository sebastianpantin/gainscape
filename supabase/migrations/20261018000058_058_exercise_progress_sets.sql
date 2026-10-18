create function public.exercise_progress_sets(exercise_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'session_id', st.session_id,
        'weight_kg', st.weight_kg,
        'effective_load_kg', st.effective_load_kg,
        'reps', st.reps,
        'rir', st.rir,
        'rir_source', st.rir_source,
        'prescription_ref', st.prescription_ref,
        'sessions', jsonb_build_object('started_at', s.started_at))
      order by s.started_at, st.position),
    '[]'::jsonb)
  from public.sets st
  join public.sessions s on s.id = st.session_id
  where st.user_id = (select auth.uid())
    and st.exercise_id = exercise_progress_sets.exercise_id
    and not st.is_warmup;
$$;

revoke execute on function public.exercise_progress_sets(uuid) from public, anon;
grant execute on function public.exercise_progress_sets(uuid) to authenticated;
