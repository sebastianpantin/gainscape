insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values
  ('craft_minute', 30, 60),
  ('custom_exercise_save_hour', 30, 3600),
  ('program_save_hour', 30, 3600),
  ('pin_change_minute', 60, 60),
  ('profile_update_hour', 60, 3600);

create function private.limit_client_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  statement_stamp text := statement_timestamp()::text;
  counted text := coalesce(nullif(current_setting('gainscape.limited_rows', true), ''), '');
  row_entry text;
begin
  if caller is null then
    return coalesce(new, old);
  end if;
  if tg_level = 'ROW' then
    row_entry := tg_argv[0] || ':' || (to_jsonb(coalesce(new, old)) ->> tg_argv[1]);
    if split_part(counted, '|', 1) is distinct from statement_stamp then
      counted := statement_stamp;
    end if;
    if position('|' || row_entry || '|' in counted || '|') > 0 then
      return coalesce(new, old);
    end if;
    perform set_config('gainscape.limited_rows', counted || '|' || row_entry, true);
  end if;
  perform private.take_rate_limit(tg_argv[0], caller);
  return coalesce(new, old);
end;
$$;

revoke execute on function private.limit_client_write() from public, anon, authenticated;

create function private.cap_pins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.pinned_exercises p where p.user_id = new.user_id) >= 50 then
    raise exception 'too_many_pins' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.cap_pins() from public, anon, authenticated;

create trigger limit_client_crafts
before insert on public.crafts
for each row execute function private.limit_client_write('craft_minute', 'id');

create trigger limit_client_custom_exercises
before insert or update on public.exercises
for each row when (new.owner_user_id is not null)
execute function private.limit_client_write('custom_exercise_save_hour', 'id');

create trigger limit_client_programs
before insert or update on public.programs
for each row when (new.owner_user_id is not null)
execute function private.limit_client_write('program_save_hour', 'id');

create trigger cap_pins
before insert on public.pinned_exercises
for each row execute function private.cap_pins();

create trigger limit_client_pin_changes
before insert or delete on public.pinned_exercises
for each row execute function private.limit_client_write('pin_change_minute', 'exercise_id');

create trigger limit_client_pin_reorders
before update on public.pinned_exercises
for each statement execute function private.limit_client_write('pin_change_minute');

create trigger limit_client_profiles
before update on public.profiles
for each row execute function private.limit_client_write('profile_update_hour', 'id');

create trigger limit_client_private_profiles
before update on public.profile_private
for each row execute function private.limit_client_write('profile_update_hour', 'user_id');
