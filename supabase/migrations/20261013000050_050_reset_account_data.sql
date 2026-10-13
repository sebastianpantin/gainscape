insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values
  ('reset_account_hour', 5, 3600);

create table private.account_resets (
  transaction_id xid8 primary key,
  user_id uuid not null
);

alter table private.account_resets enable row level security;
revoke all on private.account_resets from public, anon, authenticated;

create function private.resetting_account(subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select subject is not null and exists (
    select 1 from private.account_resets r
    where r.transaction_id = pg_catalog.pg_current_xact_id() and r.user_id = subject
  );
$$;

revoke execute on function private.resetting_account(uuid) from public, anon, authenticated;

create or replace function private.forbid_append_only_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = old.user_id) then
    return old;
  end if;
  if tg_op = 'DELETE' and private.resetting_account(old.user_id) then
    return old;
  end if;
  raise exception 'append_only' using errcode = 'restrict_violation', detail = tg_table_name;
end;
$$;

create or replace function private.limit_client_write()
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
  if caller is null or private.resetting_account(caller) then
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

create function public.reset_account_data(confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if confirmation is distinct from 'RESET' then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  perform 1 from public.profiles p where p.id = caller for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
  perform private.take_rate_limit('reset_account_hour', caller);
  insert into private.account_resets (transaction_id, user_id) values (pg_catalog.pg_current_xact_id(), caller);

  delete from public.reactions where user_id = caller;
  delete from public.events where user_id = caller;
  insert into public.deleted_sessions (id, user_id, started_at)
  select s.id, s.user_id, s.started_at from public.sessions s where s.user_id = caller
  on conflict (id) do nothing;
  delete from public.sessions where user_id = caller;
  delete from public.user_skills where user_id = caller;
  delete from public.exercise_maxes where user_id = caller;
  delete from public.rep_maxes where user_id = caller;
  delete from public.bodyweight_rep_records where user_id = caller;
  delete from public.cardio_records where user_id = caller;
  delete from public.bodyweight_entries where user_id = caller;
  delete from public.exercise_notes where user_id = caller;
  delete from public.weekly_goals where user_id = caller;
  delete from public.program_enrollments where user_id = caller;
  delete from public.user_loadout where user_id = caller;
  delete from public.crafts where user_id = caller;
  delete from public.user_items where user_id = caller;
  delete from public.item_ledger where user_id = caller;
  delete from public.drops where user_id = caller;
  delete from public.drop_luck where user_id = caller;
  delete from public.loot_rolls where user_id = caller;

  delete from private.account_resets r where r.transaction_id = pg_catalog.pg_current_xact_id();
end;
$$;

revoke execute on function public.reset_account_data(text) from public, anon, service_role;
grant execute on function public.reset_account_data(text) to authenticated;
