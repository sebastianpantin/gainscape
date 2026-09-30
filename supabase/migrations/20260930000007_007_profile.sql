create type public.training_focus as enum ('strength', 'muscle', 'powerlifting', 'general');
create type public.badge_color as enum ('gold', 'blue', 'green', 'rust', 'stone');

alter table public.profiles
  add column bio text check (char_length(bio) <= 80 and bio !~ '[[:cntrl:]]'),
  add column training_focus public.training_focus,
  add column training_since smallint check (training_since between 1950 and 2100),
  add column badge_color public.badge_color not null default 'gold';

alter table public.profile_private
  add column height_cm numeric(4, 1) check (height_cm between 100 and 250),
  add column birth_year smallint check (birth_year between 1900 and 2100);

create function private.check_training_since()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.training_since is not null and new.training_since > extract(year from now())::int then
    raise exception 'training_since_in_future' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function private.check_birth_year()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_year is not null and new.birth_year > extract(year from now())::int - 13 then
    raise exception 'birth_year_too_recent' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_training_since
before insert or update of training_since on public.profiles
for each row execute function private.check_training_since();

create trigger check_birth_year
before insert or update of birth_year on public.profile_private
for each row execute function private.check_birth_year();

grant update (bio, training_focus, training_since, badge_color) on public.profiles to authenticated;
grant update (height_cm, birth_year) on public.profile_private to authenticated;

create function public.set_timezone(candidate text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  last_change timestamptz;
  current_zone text;
  changed_at timestamptz := now();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if candidate is null or private.valid_timezone_or_utc(candidate) is distinct from candidate then
    raise exception 'invalid_timezone' using errcode = 'invalid_parameter_value';
  end if;

  select timezone, timezone_changed_at into current_zone, last_change
  from public.profile_private
  where user_id = caller
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'no_data_found';
  end if;
  if current_zone = candidate then
    return last_change;
  end if;

  if last_change is not null and last_change > changed_at - interval '7 days' then
    raise exception 'timezone_change_too_soon'
      using errcode = 'check_violation', detail = to_char((last_change + interval '7 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  update public.profile_private
  set timezone = candidate, timezone_changed_at = changed_at, updated_at = changed_at
  where user_id = caller;

  return changed_at;
end;
$$;

revoke execute on function public.set_timezone(text) from public, anon;
grant execute on function public.set_timezone(text) to authenticated;
revoke execute on function private.check_training_since(), private.check_birth_year() from public, anon, authenticated;
