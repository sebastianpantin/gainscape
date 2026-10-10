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
  if caller is null or not private.account_active(caller) then
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

revoke execute on function public.craft(uuid) from public, anon;
grant execute on function public.craft(uuid) to authenticated;
