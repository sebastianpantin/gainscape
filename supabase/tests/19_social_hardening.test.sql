begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select tests.create_user('sh_owner') as owner \gset
select tests.create_user('sh_friend') as friend \gset
select tests.make_friends(:'owner', :'friend');

select tests.authenticate_as(:'owner');
select throws_ok(
  format('update public.profiles set display_name = %L where id = %L', E'evil‮eman', :'owner'),
  '23514',
  null,
  'a display name with a bidi override is refused'
);
select throws_ok(
  format('update public.profiles set display_name = %L where id = %L', E'two⁦isolates⁩', :'owner'),
  '23514',
  null,
  'a display name with a bidi isolate is refused'
);
select throws_ok(
  format('update public.profiles set display_name = %L where id = %L', E'line\nbreak', :'owner'),
  '23514',
  null,
  'a display name with a control character is refused'
);
select throws_ok(
  format('update public.profiles set display_name = %L where id = %L', E'a\u0085b', :'owner'),
  '23514',
  null,
  'a display name with a C1 control is refused'
);
select throws_ok(
  format('update public.profiles set display_name = %L where id = %L', E' 　 ​ ', :'owner'),
  '23514',
  null,
  'a blank display name is refused'
);
select lives_ok(
  format('update public.profiles set display_name = %L where id = %L', E'Zoë \U0001F3CB', :'owner'),
  'an ordinary display name with an emoji is accepted'
);
reset role;

select tests.create_user_with_display_name('sh_trimmed', '  Ann  ') as trimmed \gset
select tests.create_user_with_display_name('sh_spoofer', E'\u202Eevil') as spoofer \gset
select tests.create_user_with_display_name('sh_blank', E'\u3000') as blank \gset
select is(
  (select p.display_name from public.profiles p where p.id = :'trimmed'),
  'Ann',
  'signup trims the requested display name'
);
select is(
  (select p.display_name from public.profiles p where p.id = :'spoofer'),
  'sh_spoofer',
  'signup falls back to the username for a display name with a bidi override'
);
select is(
  (select p.display_name from public.profiles p where p.id = :'blank'),
  'sh_blank',
  'signup falls back to the username for a blank display name'
);

select tests.create_user('sh_banned') as banned \gset
select tests.create_user('sh_ghost', false) as ghost \gset
select tests.make_friends(:'banned', :'owner');
update auth.users set banned_until = now() + interval '1 day' where id = :'banned';
insert into public.friendships (requester_id, addressee_id) values (:'owner', :'ghost');
select tests.create_user('sh_target') as target \gset
insert into public.friendships (requester_id, addressee_id) values (:'owner', :'target');
select is(private.accepted_friend_count(:'owner'), 1, 'the friend count leaves out a banned friend');
select is(private.outgoing_request_count(:'owner'), 1, 'the request count leaves out an unconfirmed addressee');

select tests.create_user('sh_at_target') as at_target \gset
select tests.authenticate_as(:'friend');
select is(
  public.send_friend_request('  @SH_At_Target ') ->> 'status',
  'sent',
  'a request by @username is sent'
);
select is(public.send_friend_request('@@sh_at_target') ->> 'status', 'not_found', 'only one leading @ is stripped');
reset role;

select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select id as deadlift from public.exercises where key = 'deadlift' \gset
select tests.authenticate_as(:'owner');
insert into public.pinned_exercises (exercise_id, position) values (:'squat', 7);
insert into public.pinned_exercises (exercise_id, position) values (:'bench', 0);
reset role;
select results_eq(
  format('select exercise_id, position from public.pinned_exercises where user_id = %L order by position', :'owner'),
  format('values (%L::uuid, 0), (%L::uuid, 1)', :'squat', :'bench'),
  'the server appends each new pin after the last one, whatever position the client sent'
);

insert into public.pinned_exercises (user_id, exercise_id, position) values (:'owner', :'deadlift', 9);
update public.pinned_exercises set position = 0 where user_id = :'owner';
update public.pinned_exercises pe
set created_at = case pe.exercise_id when :'deadlift' then '2026-01-01'::timestamptz else '2026-01-02'::timestamptz end
where pe.user_id = :'owner';
create temporary table owner_pin_order (exercise_id uuid, ordinal bigint) on commit drop;
insert into owner_pin_order
select pe.exercise_id, row_number() over (order by pe.position, pe.created_at, pe.exercise_id)
from public.pinned_exercises pe
where pe.user_id = :'owner';
grant select on owner_pin_order to authenticated;
select tests.authenticate_as(:'friend');
select results_eq(
  format(
    $$select (e ->> 'exerciseId')::uuid from jsonb_array_elements(public.get_collection(%L) -> 'exercises') e
      where (e ->> 'pinned')::boolean$$,
    :'owner'),
  'select exercise_id from owner_pin_order order by ordinal',
  'friends see pins with equal positions in the same order as the owner'
);
reset role;

select i.id as live_item from public.items i where i.retired_at is null order by i.key limit 1 \gset
select i.id as retiring_item from public.items i where i.retired_at is null and i.id <> :'live_item' order by i.key limit 1 \gset
insert into public.user_items (user_id, item_id, quantity) values (:'owner', :'live_item', 1), (:'owner', :'retiring_item', 1);
update public.items set retired_at = now() where id = :'retiring_item';
select tests.authenticate_as(:'friend');
select is(
  (select jsonb_agg(f -> 'itemId') from jsonb_array_elements(public.get_collection(:'owner') -> 'items' -> 'found') f),
  jsonb_build_array(:'live_item'::text),
  'found items leave out retired items, like catalogCount'
);
select is(
  (public.get_collection(:'owner') -> 'items' ->> 'catalogCount')::int,
  (select count(*)::int from public.items i where i.retired_at is null),
  'catalogCount counts live items'
);
reset role;

select ok(
  exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass and c.conname = 'profiles_display_name_visible' and c.convalidated
  ),
  'the display name check is validated'
);

select * from finish();
rollback;
