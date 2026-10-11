create function private.forbid_mixed_mobility_shares()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.exercise_skills es
    join public.skills s on s.id = es.skill_id
    where es.exercise_id = new.exercise_id and s.key = 'mobility'
  ) and (select count(*) from public.exercise_skills es where es.exercise_id = new.exercise_id) > 1 then
    perform private.invalid_exercise();
  end if;
  return null;
end;
$$;

create trigger mobility_trains_alone
after insert or update on public.exercise_skills
for each row execute function private.forbid_mixed_mobility_shares();

revoke execute on function private.forbid_mixed_mobility_shares() from public, anon, authenticated;
