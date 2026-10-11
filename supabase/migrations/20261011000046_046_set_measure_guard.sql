create function private.set_measure_of(set_row public.sets)
returns public.exercise_measure
language sql
immutable
set search_path = ''
as $$
  select case
    when set_row.reps is null and set_row.counted_work_s is null and set_row.duration_s is not null
      then 'time'::public.exercise_measure
    when set_row.reps is null and set_row.counted_work_s is null and set_row.distance_m is not null
      then 'distance'::public.exercise_measure
    else 'reps'::public.exercise_measure
  end;
$$;

create function private.forbid_set_measure_mismatch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select e.measure from public.exercises e where e.id = new.exercise_id)
     is distinct from private.set_measure_of(new) then
    raise exception 'set_measure_mismatch' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger set_matches_exercise_measure
after insert or update of exercise_id, reps, duration_s, distance_m, counted_work_s on public.sets
for each row execute function private.forbid_set_measure_mismatch();

revoke execute on function private.set_measure_of(public.sets) from public, anon, authenticated;
revoke execute on function private.forbid_set_measure_mismatch() from public, anon, authenticated;
