alter table public.sessions add column gear_loadout jsonb
  constraint gear_loadout_is_object check (gear_loadout is null or jsonb_typeof(gear_loadout) = 'object');

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values ('loadout_change_minute', 60, 60);

create table public.user_loadout (
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot public.gear_slot not null,
  item_id uuid not null,
  equipped_at timestamptz not null default now(),
  constraint user_loadout_pkey primary key (user_id, slot),
  foreign key (user_id, item_id) references public.user_items (user_id, item_id) on delete cascade
);

alter table public.user_loadout enable row level security;
grant select on public.user_loadout to authenticated;
create policy "read own loadout" on public.user_loadout
  for select to authenticated using (user_id = (select auth.uid()));

create function private.unequip_spent_gear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_loadout l where l.user_id = new.user_id and l.item_id = new.item_id;
  return null;
end;
$$;

create trigger unequip_spent_gear
after update of quantity on public.user_items
for each row when (new.quantity = 0)
execute function private.unequip_spent_gear();

revoke execute on function private.unequip_spent_gear() from public, anon, authenticated;

create function public.equip_gear(slot public.gear_slot, item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item_slot public.gear_slot;
  held int;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.take_rate_limit('loadout_change_minute', caller);

  perform 1 from public.profiles p where p.id = caller for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'no_data_found';
  end if;

  select i.gear_slot into item_slot
  from public.items i
  where i.id = equip_gear.item_id and i.kind = 'gear' and i.retired_at is null;
  if not found then
    raise exception 'item_not_gear' using errcode = 'invalid_parameter_value';
  end if;
  if item_slot <> equip_gear.slot then
    raise exception 'wrong_slot' using errcode = 'invalid_parameter_value';
  end if;

  select u.quantity into held
  from public.user_items u
  where u.user_id = caller and u.item_id = equip_gear.item_id
  for update;
  if coalesce(held, 0) < 1 then
    raise exception 'item_not_owned' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.user_loadout as l (user_id, slot, item_id)
  values (caller, equip_gear.slot, equip_gear.item_id)
  on conflict on constraint user_loadout_pkey do update set item_id = excluded.item_id, equipped_at = now();

  return jsonb_build_object('slot', equip_gear.slot, 'itemId', equip_gear.item_id);
end;
$$;

create function public.unequip_gear(slot public.gear_slot)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.take_rate_limit('loadout_change_minute', caller);

  perform 1 from public.profiles p where p.id = caller for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'no_data_found';
  end if;

  delete from public.user_loadout l where l.user_id = caller and l.slot = unequip_gear.slot;
end;
$$;

create function public.get_loadout(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not private.account_active(caller) then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not private.can_view_user(caller, get_loadout.target) then
    return null;
  end if;

  return jsonb_build_object(
    'userId', get_loadout.target,
    'slots', coalesce((
      select jsonb_agg(
        jsonb_build_object('slot', l.slot, 'itemId', l.item_id, 'itemKey', i.key, 'name', i.name, 'tier', i.tier)
        order by l.slot)
      from public.user_loadout l
      join public.items i on i.id = l.item_id
      join public.user_items u on u.user_id = l.user_id and u.item_id = l.item_id
      where l.user_id = get_loadout.target and u.quantity >= 1
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.equip_gear(public.gear_slot, uuid) from public, anon;
revoke execute on function public.unequip_gear(public.gear_slot) from public, anon;
revoke execute on function public.get_loadout(uuid) from public, anon;
grant execute on function public.equip_gear(public.gear_slot, uuid) to authenticated;
grant execute on function public.unequip_gear(public.gear_slot) to authenticated;
grant execute on function public.get_loadout(uuid) to authenticated;

create or replace function public.craft(recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  chosen public.recipes%rowtype;
  shortfall jsonb;
  new_craft_id uuid;
  held_after int;
  spent_slot public.gear_slot;
  equipped_slot public.gear_slot;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.profiles p where p.id = caller for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'no_data_found';
  end if;

  select r.* into chosen
  from public.recipes r
  join public.items o on o.id = r.output_item_id
  where r.id = craft.recipe_id
    and r.retired_at is null
    and o.retired_at is null
    and exists (select 1 from public.recipe_inputs i where i.recipe_id = r.id);
  if not found then
    raise exception 'unknown_recipe' using errcode = 'invalid_parameter_value';
  end if;

  perform 1
  from public.user_items u
  where u.user_id = caller
    and u.item_id in (select i.item_id from public.recipe_inputs i where i.recipe_id = chosen.id)
  order by u.item_id
  for update;

  select jsonb_agg(jsonb_build_object('itemId', i.item_id, 'have', coalesce(u.quantity, 0), 'need', i.quantity)
                   order by i.item_id)
  into shortfall
  from public.recipe_inputs i
  left join public.user_items u on u.user_id = caller and u.item_id = i.item_id
  where i.recipe_id = chosen.id and coalesce(u.quantity, 0) < i.quantity;
  if shortfall is not null then
    raise exception 'insufficient_items' using errcode = 'check_violation', detail = shortfall::text;
  end if;

  insert into public.crafts (user_id, recipe_id) values (caller, chosen.id) returning id into new_craft_id;

  insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
  select caller, i.item_id, -i.quantity, 'craft_out', new_craft_id
  from public.recipe_inputs i
  where i.recipe_id = chosen.id
  order by i.item_id;

  select l.slot into spent_slot
  from public.user_loadout l
  join public.recipe_inputs i on i.item_id = l.item_id
  where l.user_id = caller and i.recipe_id = chosen.id
  order by l.slot
  limit 1;

  update public.user_items u
  set quantity = u.quantity - i.quantity, updated_at = now()
  from public.recipe_inputs i
  where i.recipe_id = chosen.id and u.user_id = caller and u.item_id = i.item_id;

  insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
  values (caller, chosen.output_item_id, chosen.output_quantity, 'craft_in', new_craft_id);

  insert into public.user_items as held (user_id, item_id, quantity)
  values (caller, chosen.output_item_id, chosen.output_quantity)
  on conflict (user_id, item_id) do update
  set quantity = held.quantity + excluded.quantity, updated_at = now()
  returning held.quantity into held_after;

  insert into public.user_unlocks (user_id, exercise_id, item_id)
  select caller, o.grants_exercise_id, o.id
  from public.items o
  where o.id = chosen.output_item_id and o.kind = 'scroll'
  on conflict (user_id, exercise_id) do nothing;

  if spent_slot is not null
     and not exists (select 1 from public.user_loadout l where l.user_id = caller and l.slot = spent_slot) then
    insert into public.user_loadout (user_id, slot, item_id)
    select caller, o.gear_slot, o.id
    from public.items o
    where o.id = chosen.output_item_id and o.kind = 'gear' and o.gear_slot = spent_slot
    returning slot into equipped_slot;
  end if;

  return jsonb_build_object('craftId', new_craft_id, 'itemId', chosen.output_item_id, 'quantity', held_after,
                            'equippedSlot', equipped_slot);
end;
$$;
