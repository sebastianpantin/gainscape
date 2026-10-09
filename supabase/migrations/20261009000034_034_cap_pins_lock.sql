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
  return new;
end;
$$;

revoke execute on function private.cap_pins() from public, anon, authenticated;
