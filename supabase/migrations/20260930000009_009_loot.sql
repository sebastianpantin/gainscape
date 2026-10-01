create type public.roll_kind as enum ('regular', 'pr');
create type public.ledger_reason as enum ('drop', 'craft_in', 'craft_out', 'revoke');
create type public.revoke_reason as enum ('set_removed', 'session_deleted', 'no_longer_qualifies');

create table public.loot_rolls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  set_id uuid not null,
  kind public.roll_kind not null,
  local_date date not null,
  roll_index int not null check (roll_index >= 0),
  drop_table_id uuid not null references public.drop_tables (id),
  chance numeric(6, 5) not null check (chance > 0 and chance <= 1),
  hit boolean not null,
  loot_version int not null,
  created_at timestamptz not null default now(),
  unique (user_id, set_id, kind),
  unique (user_id, local_date, kind, roll_index)
);

create table public.drops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  loot_roll_id uuid not null unique references public.loot_rolls (id) on delete cascade,
  session_id uuid not null,
  set_id uuid not null,
  item_id uuid not null references public.items (id),
  quantity int not null check (quantity between 1 and 1000),
  source public.roll_kind not null,
  revoked_at timestamptz,
  revoke_reason public.revoke_reason,
  revoked_quantity int,
  created_at timestamptz not null default now(),
  constraint revocation_fields_together check (
    (revoked_at is null) = (revoke_reason is null) and (revoked_at is null) = (revoked_quantity is null)),
  constraint revoked_quantity_range check (revoked_quantity between 0 and quantity)
);
create index drops_by_session on public.drops (session_id);
create index drops_by_user_newest_first on public.drops (user_id, created_at desc);

create table public.drop_luck (
  user_id uuid not null references public.profiles (id) on delete cascade,
  drop_table_id uuid not null references public.drop_tables (id),
  dry_rolls int not null default 0 check (dry_rolls >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, drop_table_id)
);

create table public.user_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null references public.items (id),
  quantity int not null check (quantity >= 0),
  first_obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.item_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null references public.items (id),
  delta int not null check (delta <> 0),
  reason public.ledger_reason not null,
  ref_id uuid not null,
  created_at timestamptz not null default now()
);
create index item_ledger_by_user on public.item_ledger (user_id, created_at);

create function private.forbid_append_only_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = old.user_id) then
    return old;
  end if;
  raise exception 'append_only' using errcode = 'restrict_violation', detail = tg_table_name;
end;
$$;

create trigger loot_rolls_are_append_only
before update or delete on public.loot_rolls
for each row execute function private.forbid_append_only_changes();

create trigger item_ledger_is_append_only
before update or delete on public.item_ledger
for each row execute function private.forbid_append_only_changes();

revoke execute on function private.forbid_append_only_changes() from public, anon, authenticated;

alter table public.loot_rolls enable row level security;
alter table public.drops enable row level security;
alter table public.drop_luck enable row level security;
alter table public.user_items enable row level security;
alter table public.item_ledger enable row level security;

grant select on public.loot_rolls, public.drops, public.user_items, public.item_ledger to authenticated;

create policy "read own loot rolls" on public.loot_rolls
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own drops" on public.drops
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own items" on public.user_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "read own item ledger" on public.item_ledger
  for select to authenticated using (user_id = (select auth.uid()));
