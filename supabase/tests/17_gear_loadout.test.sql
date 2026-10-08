begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

select tests.create_user('gl_owner') as owner \gset
select tests.create_user('gl_friend') as friend \gset
select tests.create_user('gl_stranger') as stranger \gset
select tests.create_user('gl_pending') as pending \gset
select tests.create_user('gl_former') as former \gset
select tests.make_friends(:'owner', :'friend');
insert into public.friendships (requester_id, addressee_id) values (:'pending', :'owner');
select id as rookie_belt from public.items where key = 'rookie_belt' \gset
select id as rookie_gloves from public.items where key = 'rookie_gloves' \gset
select id as grinder_belt from public.items where key = 'grinder_belt' \gset
select id as grinder_scraps from public.items where key = 'grinder_scraps' \gset
select id as grinder_belt_recipe from public.recipes where key = 'grinder_belt' \gset

select has_table('public', 'user_loadout', 'user_loadout exists');
select col_is_pk('public', 'user_loadout', array['user_id', 'slot'], 'one item per user and slot');
select fk_ok(
  'public', 'user_loadout', array['user_id', 'item_id'],
  'public', 'user_items', array['user_id', 'item_id'],
  'an equipped item is always a held item'
);
select ok(
  has_table_privilege('authenticated', 'public.user_loadout', 'select')
    and not has_table_privilege('authenticated', 'public.user_loadout', 'insert')
    and not has_table_privilege('authenticated', 'public.user_loadout', 'update')
    and not has_table_privilege('authenticated', 'public.user_loadout', 'delete'),
  'authenticated may only select the loadout'
);
select is(
  (select array_agg(p.policyname::text order by p.policyname) from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'user_loadout'),
  array['read own loadout'],
  'the loadout has only the owner read policy'
);
select ok(
  has_function_privilege('authenticated', 'public.equip_gear(public.gear_slot, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.equip_gear(public.gear_slot, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.unequip_gear(public.gear_slot)', 'execute')
    and not has_function_privilege('anon', 'public.unequip_gear(public.gear_slot)', 'execute')
    and has_function_privilege('authenticated', 'public.get_loadout(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.get_loadout(uuid)', 'execute'),
  'only authenticated may equip, unequip and read a loadout'
);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
   where p.oid in ('public.equip_gear(public.gear_slot, uuid)'::regprocedure,
                   'public.unequip_gear(public.gear_slot)'::regprocedure,
                   'public.get_loadout(uuid)'::regprocedure,
                   'private.unequip_spent_gear()'::regprocedure)
     and p.prosecdef and 'search_path=""' = any(p.proconfig)),
  array['equip_gear', 'get_loadout', 'unequip_gear', 'unequip_spent_gear'],
  'the loadout functions run as definer with an empty search path'
);
select ok(
  not has_function_privilege('authenticated', 'private.unequip_spent_gear()', 'execute')
    and not has_function_privilege('anon', 'private.unequip_spent_gear()', 'execute'),
  'no client may call the unequip trigger function'
);

select has_column('public', 'sessions', 'gear_loadout', 'sessions carry a gear loadout snapshot');
select col_type_is('public', 'sessions', 'gear_loadout', 'jsonb', 'the snapshot is jsonb');
select col_is_null('public', 'sessions', 'gear_loadout', 'sessions from before gear have no snapshot');
select tests.add_session(:'owner', now() - interval '1 day') as session_id \gset
select is(
  (select gear_loadout from public.sessions where id = :'session_id'),
  null,
  'a session without a snapshot stores null'
);
select lives_ok(
  format($$update public.sessions set gear_loadout = '{"belt": "ascendant"}' where id = %L$$, :'session_id'),
  'an object snapshot is stored'
);
select throws_ok(
  format($$update public.sessions set gear_loadout = '["belt"]' where id = %L$$, :'session_id'),
  '23514',
  null,
  'a snapshot that is not an object is rejected'
);

insert into public.user_items (user_id, item_id, quantity) values
  (:'owner', :'rookie_belt', 1),
  (:'owner', :'rookie_gloves', 1),
  (:'owner', :'grinder_scraps', 3),
  (:'owner', :'grinder_belt', 0);

select throws_ok(
  format($$select public.equip_gear('belt', %L)$$, :'rookie_belt'),
  '42501',
  'not_authenticated',
  'equipping needs a signed-in user'
);

select tests.authenticate_as(:'owner');
select is(
  public.equip_gear('belt', :'rookie_belt'),
  jsonb_build_object('slot', 'belt', 'itemId', :'rookie_belt'::uuid),
  'equipping an owned rookie belt into the belt slot returns the slot and item'
);
select results_eq(
  'select slot::text, item_id from public.user_loadout',
  format($$values ('belt', %L::uuid)$$, :'rookie_belt'),
  'the owner reads their equipped belt'
);
select throws_ok(
  format($$select public.equip_gear('belt', %L)$$, :'grinder_belt'),
  '22023',
  'item_not_owned',
  'a gear item held zero times cannot be equipped'
);
select throws_ok(
  format($$select public.equip_gear('belt', %L)$$, (select id from public.items where key = 'titan_belt')),
  '22023',
  'item_not_owned',
  'a gear item never held cannot be equipped'
);
select throws_ok(
  format($$select public.equip_gear('belt', %L)$$, :'grinder_scraps'),
  '22023',
  'item_not_gear',
  'scraps cannot be equipped'
);
select throws_ok(
  format($$select public.equip_gear('belt', %L)$$, gen_random_uuid()),
  '22023',
  'item_not_gear',
  'an unknown item cannot be equipped'
);
select throws_ok(
  format($$select public.equip_gear('gloves', %L)$$, :'rookie_belt'),
  '22023',
  'wrong_slot',
  'a belt cannot go into the gloves slot'
);
select throws_ok(
  format($$insert into public.user_loadout (user_id, slot, item_id) values (%L, 'gloves', %L)$$, :'owner', :'rookie_gloves'),
  '42501',
  null,
  'a client cannot insert into the loadout'
);
select throws_ok(
  format($$update public.user_loadout set item_id = %L$$, :'rookie_gloves'),
  '42501',
  null,
  'a client cannot update the loadout'
);
select throws_ok('delete from public.user_loadout', '42501', null, 'a client cannot delete from the loadout');
reset role;

update public.user_items set quantity = 1 where user_id = :'owner' and item_id = :'grinder_belt';
select tests.authenticate_as(:'owner');
select lives_ok(
  format($$select public.equip_gear('belt', %L)$$, :'grinder_belt'),
  'equipping a second belt replaces the first'
);
select results_eq(
  'select slot::text, item_id from public.user_loadout',
  format($$values ('belt', %L::uuid)$$, :'grinder_belt'),
  'the belt slot holds only the grinder belt'
);
select lives_ok(
  format($$select public.equip_gear('gloves', %L)$$, :'rookie_gloves'),
  'the gloves slot is filled independently'
);
select is(
  public.get_loadout(:'owner'),
  jsonb_build_object(
    'userId', :'owner'::uuid,
    'slots', jsonb_build_array(
      jsonb_build_object('slot', 'belt', 'itemId', :'grinder_belt'::uuid, 'itemKey', 'grinder_belt',
                         'name', (select name from public.items where key = 'grinder_belt'), 'tier', 'grinder'),
      jsonb_build_object('slot', 'gloves', 'itemId', :'rookie_gloves'::uuid, 'itemKey', 'rookie_gloves',
                         'name', (select name from public.items where key = 'rookie_gloves'), 'tier', 'rookie'))),
  'the owner reads their own loadout in slot order'
);
select lives_ok($$select public.unequip_gear('belt')$$, 'unequipping the belt succeeds');
select is((select count(*)::int from public.user_loadout where slot = 'belt'), 0, 'the belt slot is empty');
select lives_ok($$select public.unequip_gear('belt')$$, 'unequipping an empty slot is a no-op');
select lives_ok(
  format($$select public.equip_gear('belt', %L)$$, :'rookie_belt'),
  'the rookie belt goes back on'
);
reset role;

select tests.authenticate_as(:'friend');
select is((select count(*)::int from public.user_loadout), 0, 'a friend reads none of the owner''s loadout rows');
select is(
  jsonb_array_length(public.get_loadout(:'owner') -> 'slots'),
  2,
  'a friend reads the owner''s loadout through get_loadout'
);
reset role;

select tests.authenticate_as(:'stranger');
select is(public.get_loadout(:'owner'), null, 'a stranger gets no loadout');
reset role;
select tests.authenticate_as(:'pending');
select is(public.get_loadout(:'owner'), null, 'a pending request gets no loadout');
reset role;
select tests.make_friends(:'owner', :'former');
delete from public.friendships where requester_id = :'owner' and addressee_id = :'former';
select tests.authenticate_as(:'former');
select is(public.get_loadout(:'owner'), null, 'a removed friend gets no loadout');
reset role;

update public.user_items set quantity = 2 where user_id = :'owner' and item_id = :'rookie_gloves';
update public.user_items set quantity = quantity - 1 where user_id = :'owner' and item_id = :'rookie_gloves';
select is(
  (select count(*)::int from public.user_loadout where user_id = :'owner' and slot = 'gloves'),
  1,
  'spending a spare copy keeps the item equipped'
);
update public.user_items set quantity = quantity - 1 where user_id = :'owner' and item_id = :'rookie_belt';
select is(
  (select count(*)::int from public.user_loadout where user_id = :'owner' and slot = 'belt'),
  0,
  'revoking the only copy of an equipped item unequips it'
);
select is(
  (select count(*)::int from public.user_loadout where user_id = :'owner'),
  1,
  'the other slots stay equipped'
);

insert into public.user_items (user_id, item_id, quantity) values (:'stranger', :'rookie_belt', 1), (:'stranger', :'grinder_scraps', 8);
select tests.authenticate_as(:'stranger');
select public.equip_gear('belt', :'rookie_belt');
select is(
  public.craft(:'grinder_belt_recipe') ->> 'equippedSlot',
  'belt',
  'crafting from the only equipped copy equips the output in the same slot'
);
select results_eq(
  'select slot::text, item_id from public.user_loadout',
  format($$values ('belt', %L::uuid)$$, :'grinder_belt'),
  'the crafted grinder belt is in the belt slot'
);
reset role;

insert into public.user_items (user_id, item_id, quantity) values (:'friend', :'rookie_belt', 2), (:'friend', :'grinder_scraps', 8);
select tests.authenticate_as(:'friend');
select public.equip_gear('belt', :'rookie_belt');
select is(
  public.craft(:'grinder_belt_recipe') -> 'equippedSlot',
  'null'::jsonb,
  'crafting from a spare copy leaves the equipped item and reports no equipped slot'
);
select results_eq(
  'select slot::text, item_id from public.user_loadout',
  format($$values ('belt', %L::uuid)$$, :'rookie_belt'),
  'the rookie belt stays equipped'
);
reset role;

delete from auth.users where id = :'owner';
select is(
  (select count(*)::int from public.user_loadout where user_id = :'owner'),
  0,
  'deleting the account deletes its loadout'
);

select * from finish();
rollback;
