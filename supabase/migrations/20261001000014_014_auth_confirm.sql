create function private.rotate_password_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null
     and new.email_confirmed_at is not null
     and coalesce(old.confirmation_token, '') <> '' then
    new.encrypted_password := extensions.crypt(
      encode(extensions.gen_random_bytes(32), 'hex'),
      extensions.gen_salt('bf')
    );
  end if;
  return new;
end;
$$;

create trigger rotate_password_on_confirm
before update of email_confirmed_at on auth.users
for each row execute function private.rotate_password_on_confirm();

create function private.username_change_window()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '1 hour';
$$;

create function public.change_username(candidate text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  wanted text := lower(trim(change_username.candidate));
  current_name text;
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.take_rate_limit('username_check_minute', caller);
  if wanted is null or wanted !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = caller and u.email_confirmed_at > now() - private.username_change_window()
  ) then
    return jsonb_build_object('status', 'closed');
  end if;

  select p.username into current_name from public.profiles p where p.id = caller for update;
  if current_name = wanted then
    return jsonb_build_object('status', 'ok', 'username', wanted);
  end if;
  perform private.release_stale_username(wanted);
  if exists (select 1 from public.profiles p where p.username = wanted) then
    return jsonb_build_object('status', 'taken');
  end if;

  begin
    update public.profiles p
    set username = wanted,
        display_name = case when p.display_name = current_name then wanted else p.display_name end,
        updated_at = now()
    where p.id = caller;
  exception
    when unique_violation then
      return jsonb_build_object('status', 'taken');
  end;
  return jsonb_build_object('status', 'ok', 'username', wanted);
end;
$$;

revoke execute on function private.rotate_password_on_confirm() from public, anon, authenticated;
revoke execute on function private.username_change_window() from public, anon, authenticated;
revoke execute on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated;
