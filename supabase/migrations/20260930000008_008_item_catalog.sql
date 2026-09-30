create type public.item_kind as enum ('gear', 'material', 'pet', 'scroll');
create type public.item_rarity as enum ('common', 'uncommon', 'rare', 'legendary');
create type public.item_tier as enum ('rookie', 'grinder', 'tempered', 'forged', 'titan', 'mythic', 'ascendant');
create type public.gear_slot as enum ('belt', 'chalk', 'straps', 'sleeves', 'shoes', 'gloves');

alter table public.exercises add column requires_unlock boolean not null default false;
alter table public.exercises add constraint only_built_ins_require_unlock
  check (not requires_unlock or (owner_user_id is null and variation_of_id is not null));

create table public.items (
  id uuid primary key,
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 1 and 60),
  kind public.item_kind not null,
  rarity public.item_rarity not null,
  tier public.item_tier,
  gear_slot public.gear_slot,
  icon_key text not null,
  description text not null default '' check (char_length(description) <= 200),
  grants_exercise_id uuid references public.exercises (id),
  sort_order int not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gear_has_tier_and_slot check ((kind = 'gear') = (gear_slot is not null) and (kind <> 'gear' or tier is not null)),
  constraint materials_have_a_tier check (kind <> 'material' or tier is not null),
  constraint scrolls_grant_an_exercise check ((kind = 'scroll') = (grants_exercise_id is not null))
);
create unique index items_name_unique on public.items (lower(name));

create table public.drop_tables (
  id uuid primary key,
  key text not null unique,
  name text not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drop_entries (
  drop_table_id uuid not null references public.drop_tables (id) on delete cascade,
  item_id uuid not null references public.items (id),
  weight int not null check (weight between 1 and 1000000),
  min_quantity int not null check (min_quantity >= 1),
  max_quantity int not null,
  primary key (drop_table_id, item_id),
  constraint quantity_range check (max_quantity between min_quantity and 1000)
);

create table public.recipes (
  id uuid primary key,
  key text not null unique,
  output_item_id uuid not null references public.items (id),
  output_quantity int not null default 1 check (output_quantity between 1 and 1000),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_inputs (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  item_id uuid not null references public.items (id),
  quantity int not null check (quantity between 1 and 1000),
  primary key (recipe_id, item_id)
);

create table public.user_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  item_id uuid not null references public.items (id),
  source_drop_id uuid,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.items enable row level security;
alter table public.drop_tables enable row level security;
alter table public.drop_entries enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_inputs enable row level security;
alter table public.user_unlocks enable row level security;

grant select on
  public.items, public.drop_tables, public.drop_entries, public.recipes, public.recipe_inputs, public.user_unlocks
to authenticated;

create policy "read items" on public.items for select to authenticated using (true);
create policy "read drop tables" on public.drop_tables for select to authenticated using (true);
create policy "read drop entries" on public.drop_entries for select to authenticated using (true);
create policy "read recipes" on public.recipes for select to authenticated using (true);
create policy "read recipe inputs" on public.recipe_inputs for select to authenticated using (true);
create policy "read own unlocks" on public.user_unlocks
  for select to authenticated using (user_id = (select auth.uid()));

drop policy "read built-in and own exercises" on public.exercises;
create policy "read built-in, unlocked and own exercises" on public.exercises
  for select to authenticated using (
    owner_user_id = (select auth.uid())
    or (owner_user_id is null and (not requires_unlock or exists (
      select 1 from public.user_unlocks u where u.user_id = (select auth.uid()) and u.exercise_id = exercises.id)))
  );
