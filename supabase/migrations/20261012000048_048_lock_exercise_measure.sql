create function private.prevent_measure_change_once_logged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.measure is distinct from old.measure
     and exists (select 1 from public.sets where exercise_id = old.id) then
    raise exception 'measure of exercise % cannot change after sets were logged', old.id
      using errcode = 'check_violation';
  end if;
  if old.tracks_distance and not new.tracks_distance
     and exists (select 1 from public.sets where exercise_id = old.id and distance_m is not null) then
    raise exception 'distance tracking of exercise % cannot stop after a distance was logged', old.id
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger lock_measure_once_logged
after update of measure, tracks_distance on public.exercises
for each row execute function private.prevent_measure_change_once_logged();

revoke execute on function private.prevent_measure_change_once_logged() from public, anon, authenticated;
