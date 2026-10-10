begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select tests.create_user('ca_active') as active \gset
select tests.create_user('ca_banned') as banned \gset
select tests.create_user('ca_unconfirmed', false) as unconfirmed \gset
select id as grinder_scraps from public.items where key = 'grinder_scraps' \gset
select id as rookie_belt from public.items where key = 'rookie_belt' \gset
select id as grinder_belt_recipe from public.recipes where key = 'grinder_belt' \gset

insert into public.user_items (user_id, item_id, quantity)
values
  (:'active', :'grinder_scraps', 8), (:'active', :'rookie_belt', 1),
  (:'banned', :'grinder_scraps', 8), (:'banned', :'rookie_belt', 1),
  (:'unconfirmed', :'grinder_scraps', 8), (:'unconfirmed', :'rookie_belt', 1);
update auth.users set banned_until = now() + interval '1 day' where id = :'banned';

select tests.authenticate_as(:'banned');
select throws_ok(
  format($$select public.craft(%L)$$, :'grinder_belt_recipe'),
  '42501',
  'not_authenticated',
  'a banned caller cannot craft'
);
reset role;

select tests.authenticate_as(:'unconfirmed');
select throws_ok(
  format($$select public.craft(%L)$$, :'grinder_belt_recipe'),
  '42501',
  'not_authenticated',
  'an unconfirmed caller cannot craft'
);
reset role;

select is(
  (select quantity from public.user_items where user_id = :'banned' and item_id = :'grinder_scraps'),
  8,
  'a refused craft spends nothing'
);

select tests.authenticate_as(:'active');
select lives_ok(
  format($$select public.craft(%L)$$, :'grinder_belt_recipe'),
  'an active caller still crafts'
);
reset role;

select * from finish();
rollback;
