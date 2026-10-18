begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

select tests.create_user('fd_owner') as a \gset
select tests.create_user('fd_friend') as b \gset
select tests.create_user('fd_stranger') as c \gset
select tests.create_user('fd_pending') as p \gset
select tests.create_user('fd_banned') as z \gset
select tests.create_user('fd_declined') as d \gset
select tests.create_user('fd_unconfirmed', false) as u \gset
select tests.create_user('fd_former') as x \gset
select tests.make_friends(:'u', :'b');
select tests.make_friends(:'x', :'a');
insert into public.friendships (requester_id, addressee_id, status, responded_at) values (:'d', :'a', 'declined', now());
select tests.make_friends(:'a', :'b');
select tests.make_friends(:'z', :'b');
insert into public.friendships (requester_id, addressee_id) values (:'p', :'a');

select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as dip from public.exercises where key = 'weighted_dip' \gset
select tests.add_session(:'a', now() - interval '2 hours') as s1 \gset
select tests.add_session(:'a', now() - interval '1 hour') as s2 \gset
select tests.add_session(:'z', now() - interval '1 hour') as zs \gset

select tests.add_event(:'a', :'s1', 'pr:' || :'bench', 'pr', jsonb_build_object(
  'exerciseId', :'bench', 'kind', 'rep_max', 'reps', 5, 'loadKg', 140, 'previousLoadKg', 130,
  'previousReps', null, 'totalLoadKg', null, 'secret', 'hidden')) as bench_event \gset
select tests.add_event(:'a', :'s1', 'pr:' || :'dip', 'pr', jsonb_build_object(
  'exerciseId', :'dip', 'kind', 'rep_max', 'reps', 5, 'loadKg', 20, 'previousLoadKg', 10,
  'previousReps', null, 'totalLoadKg', 100)) as dip_event \gset
select tests.add_event(:'a', :'s1', 'level:legs', 'level_up', '{"skill": "legs", "from": 69, "to": 70}') as level_event \gset
select tests.add_event(:'a', :'s2', 'level:core', 'level_up', '{"skill": "core", "from": 9, "to": 10}');
select tests.add_event(:'a', :'s2', 'level:chest', 'level_up', '{"skill": "chest", "from": 19, "to": 20}');
select tests.add_event(:'z', :'zs', 'level:legs', 'level_up', '{"skill": "legs", "from": 9, "to": 10}');
select tests.add_session(:'u', now() - interval '1 hour') as us \gset
select tests.add_event(:'u', :'us', 'level:legs', 'level_up', '{"skill": "legs", "from": 9, "to": 10}');
select id as titan from public.items where key = 'titan_scraps' \gset
select tests.add_event(:'a', :'s2', 'drop:' || gen_random_uuid(), 'drop', jsonb_build_object(
  'dropId', gen_random_uuid(), 'itemId', :'titan', 'itemKey', 'titan_scraps', 'quantity', 2, 'source', 'pr')) as drop_event \gset

create function pg_temp.keys_of(payload jsonb) returns text language sql as $$
  select string_agg(k, ',' order by k) from jsonb_object_keys(payload) k;
$$;
update auth.users set banned_until = now() + interval '1 day' where id = :'z';

create temporary table feed_page (event_id uuid, occurred_at timestamptz) on commit drop;
grant all on feed_page to authenticated;

create function pg_temp.page_through(page_size int) returns uuid[] language plpgsql as $$
declare
  collected uuid[] := '{}';
  last_at timestamptz;
  last_id uuid;
  fetched int;
begin
  loop
    delete from feed_page;
    insert into feed_page select f.event_id, f.occurred_at from public.get_feed(last_at, last_id, page_size) f;
    get diagnostics fetched = row_count;
    exit when fetched = 0;
    collected := collected || (select array_agg(fp.event_id order by fp.occurred_at desc, fp.event_id desc) from feed_page fp);
    select fp.occurred_at, fp.event_id into last_at, last_id
    from feed_page fp order by fp.occurred_at, fp.event_id limit 1;
    exit when fetched < page_size;
  end loop;
  return collected;
end;
$$;

select tests.authenticate_as(:'b');
select is(
  (select count(*)::int from public.get_feed() f where f.user_id = :'a'),
  6,
  'a friend sees the owner events'
);
select is(
  (select count(*)::int from public.get_feed() f where f.user_id = :'u'),
  0,
  'an unconfirmed friend events are hidden'
);
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'bench_event'),
  'exerciseId,exerciseName,kind,loadKg,loadType,previousLoadKg,previousReps,reps,weightsHidden',
  'a friend sees exactly the PR keys while weights are shown'
);
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'level_event'),
  'from,skill,skillName,to',
  'a friend sees exactly the level keys'
);
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'drop_event'),
  'dropId,iconKey,itemId,itemKey,itemName,quantity,rarity,source,tier',
  'a friend sees exactly the drop keys'
);
select is(
  (select count(*)::int from public.get_feed() f where f.user_id = :'z'),
  0,
  'a banned friend events are hidden'
);
select ok(
  not exists (select 1 from public.get_hiscores() h where h.user_id = :'z'),
  'a banned friend is left out of hiscores'
);
select is(
  (select f.payload ->> 'skillName' from public.get_feed() f where f.event_id = :'level_event'),
  (select s.name from public.skills s where s.key = 'legs'),
  'level events carry the skill name'
);
select is(
  (select (f.payload ->> 'loadKg')::numeric from public.get_feed() f where f.event_id = :'bench_event'),
  140::numeric,
  'loads are shown while weights are shown'
);
select is(
  (select f.payload ->> 'exerciseName' from public.get_feed() f where f.event_id = :'bench_event'),
  'Barbell Bench Press',
  'PR events carry the exercise name'
);
select ok(
  not exists (select 1 from public.get_feed() f, jsonb_object_keys(f.payload) k where k = 'secret'),
  'an unknown stored key never reaches the feed'
);
select is(
  (select f.payload ->> 'totalLoadKg' from public.get_feed() f where f.event_id = :'dip_event'),
  null,
  'the bodyweight-plus total is hidden while bodyweight is hidden'
);
reset role;

update public.profiles set show_bodyweight = true where id = :'a';
select tests.authenticate_as(:'b');
select is(
  (select (f.payload ->> 'totalLoadKg')::numeric from public.get_feed() f where f.event_id = :'dip_event'),
  100::numeric,
  'the bodyweight-plus total is shown while bodyweight is shown'
);
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'dip_event'),
  'exerciseId,exerciseName,kind,loadKg,loadType,previousLoadKg,previousReps,reps,totalLoadKg,weightsHidden',
  'a friend sees exactly the PR keys with the total while bodyweight is shown'
);
reset role;

update public.profiles set show_weights = false, show_bodyweight = false where id = :'a';
select tests.authenticate_as(:'b');
select ok(
  not exists (
    select 1 from public.get_feed() f, jsonb_object_keys(f.payload) k
    where f.event_id in (:'bench_event', :'dip_event') and k ilike '%loadkg%'
  ),
  'hidden weights remove every load key'
);
select ok(
  (select (f.payload ->> 'weightsHidden')::boolean from public.get_feed() f where f.event_id = :'bench_event'),
  'weightsHidden is set'
);
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'bench_event'),
  'exerciseId,exerciseName,kind,loadType,previousReps,reps,weightsHidden',
  'a friend sees exactly the PR keys while weights are hidden'
);
reset role;
update public.profiles set show_bodyweight = true where id = :'a';
select tests.authenticate_as(:'b');
select is(
  (select f.payload ->> 'totalLoadKg' from public.get_feed() f where f.event_id = :'dip_event'),
  null,
  'hidden weights also hide the bodyweight-plus total'
);
select is(
  (select (f.payload ->> 'loadKg')::numeric from public.get_feed() f where f.event_id = :'dip_event'),
  null,
  'hidden weights hide the added load'
);
reset role;
update public.profiles set show_weights = true, show_bodyweight = false where id = :'a';
select tests.authenticate_as(:'b');
select is(
  (select (f.payload ->> 'loadKg')::numeric from public.get_feed() f where f.event_id = :'dip_event'),
  20::numeric,
  'hidden bodyweight keeps the added load'
);
reset role;

update public.profiles set show_weights = false, show_bodyweight = false where id = :'a';
select tests.authenticate_as(:'a');
select ok(
  (select (f.payload ->> 'loadKg')::numeric = 140 and not (f.payload ->> 'weightsHidden')::boolean
   from public.get_feed() f where f.event_id = :'bench_event')
  and (select (f.payload ->> 'totalLoadKg')::numeric = 100 from public.get_feed() f where f.event_id = :'dip_event'),
  'the owner always sees every load'
);
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'dip_event'),
  'exerciseId,exerciseName,kind,loadKg,loadType,previousLoadKg,previousReps,reps,totalLoadKg,weightsHidden',
  'the owner sees exactly the PR keys with every load'
);
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'drop_event'),
  'dropId,iconKey,itemId,itemKey,itemName,quantity,rarity,source,tier',
  'the owner sees exactly the drop keys'
);
select is(public.set_gz(:'bench_event', true), '{"status": "not_found"}'::jsonb, 'nobody can gz their own event');
reset role;

select tests.authenticate_as(:'b');
select public.set_gz(:'bench_event', true);
select is(public.set_gz(:'bench_event', true) ->> 'gzCount', '1', 'a repeated gz is a no-op');
select is(
  (select f.gz_given from public.get_feed() f where f.event_id = :'bench_event'),
  true,
  'the giver sees their gz'
);
reset role;
select tests.authenticate_as(:'a');
select ok(
  (select f.gz_count = 1 and not f.gz_given and f.is_own from public.get_feed() f where f.event_id = :'bench_event'),
  'the owner sees the count, not a gz of their own'
);
reset role;
select tests.authenticate_as(:'b');
select public.set_gz(:'bench_event', false);
select is(public.set_gz(:'bench_event', false) ->> 'gzCount', '0', 'removing a gz twice leaves none');
select lives_ok(
  format('select public.set_gz(%L, n %% 2 = 0) from generate_series(1, 116) n', :'level_event'),
  '120 gz calls within a minute pass'
);
select throws_ok(format('select public.set_gz(%L, true)', :'level_event'), 'PT429', 'rate_limited', 'the 121st gz is limited');
reset role;

select tests.authenticate_as(:'c');
select is((select count(*)::int from public.get_feed()), 0, 'a stranger sees no events');
select is(
  (select array_agg(h.user_id) from public.get_hiscores() h),
  array[:'c'::uuid],
  'a stranger only ranks themself'
);
select is(public.set_gz(:'bench_event', true), '{"status": "not_found"}'::jsonb, 'a stranger cannot gz');
select is(
  public.set_gz(:'bench_event', false),
  jsonb_build_object('status', 'ok', 'eventId', :'bench_event'::uuid, 'given', false),
  'a stranger ungiving gets no gz count'
);
reset role;
select is(
  (select sum(h.hits)::int from private.rate_limit_hits h where h.subject = :'c' and h.bucket = 'gz_minute'),
  2,
  'gz misses count against the limit'
);
select tests.authenticate_as(:'d');
select is((select count(*)::int from public.get_feed() f where f.user_id = :'a'), 0, 'a declined requester sees no events');
reset role;
select tests.authenticate_as(:'x');
select is(public.set_gz(:'bench_event', true) ->> 'status', 'ok', 'a friend gives gz');
select public.remove_friend(:'a');
select is(public.set_gz(:'bench_event', true), '{"status": "not_found"}'::jsonb, 'an ex-friend cannot give gz');
select is(
  public.set_gz(:'bench_event', false),
  jsonb_build_object('status', 'ok', 'eventId', :'bench_event'::uuid, 'given', false),
  'an ex-friend can take back their gz without seeing the count'
);
reset role;
select is(
  (select count(*)::int from public.reactions r where r.event_id = :'bench_event' and r.user_id = :'x'),
  0,
  'the ex-friend gz is gone'
);
reset role;
select tests.authenticate_as(:'p');
select is((select count(*)::int from public.get_feed()), 0, 'a pending request grants no feed');
reset role;

select id as run from public.exercises where key = 'running' \gset
select tests.add_event(:'a', :'s2', 'pr:' || gen_random_uuid(), 'pr', jsonb_build_object(
  'exerciseId', :'run', 'kind', 'cardio', 'recordKinds', 'distance,pace,duration',
  'distanceM', 6000, 'previousDistanceM', 5000, 'paceSPerKm', 300, 'previousPaceSPerKm', 360,
  'countedWorkS', 1800, 'previousCountedWorkS', 1500, 'secret', 'hidden')) as cardio_event \gset
update public.profiles set show_weights = true where id = :'a';
select tests.authenticate_as(:'b');
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'cardio_event'),
  'countedWorkS,distanceM,exerciseId,exerciseName,kind,paceSPerKm,paceUnit,previousCountedWorkS,previousDistanceM,previousPaceSPerKm,recordKinds,weightsHidden',
  'a friend sees exactly the cardio PR keys while weights are shown'
);
select is(
  (select f.payload ->> 'exerciseName' from public.get_feed() f where f.event_id = :'cardio_event'),
  'Running',
  'a cardio PR names the activity'
);
reset role;
update public.profiles set show_weights = false where id = :'a';
select tests.authenticate_as(:'b');
select is(
  (select pg_temp.keys_of(f.payload) from public.get_feed() f where f.event_id = :'cardio_event'),
  'countedWorkS,exerciseId,exerciseName,kind,paceUnit,previousCountedWorkS,recordKinds,weightsHidden',
  'hidden weights hide cardio distance and pace but keep the record kinds and duration'
);
reset role;
select tests.authenticate_as(:'a');
select ok(
  (select (f.payload ->> 'distanceM')::numeric = 6000 from public.get_feed() f where f.event_id = :'cardio_event'),
  'the owner always sees the cardio distance'
);
reset role;

insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
select :'a', :'s2', 'level:bulk_' || n, 'level_up', now() - interval '3 hours', '{}'::jsonb from generate_series(1, 55) n;
select array_agg(e.id order by e.occurred_at desc, e.id desc)::text as expected_order
from public.events e where e.user_id = :'a' \gset
select tests.authenticate_as(:'b');
select is(pg_temp.page_through(2), :'expected_order'::uuid[], 'keyset pages of 2 return every event once, in order');
reset role;
select tests.add_session(:'b', now() - interval '3 hours') as bs \gset
insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
select :'b', :'bs', 'level:mix_' || n, 'level_up', now() - interval '3 hours' + make_interval(secs => (n % 3) - 1), '{}'::jsonb
from generate_series(1, 9) n;
select array_agg(e.id order by e.occurred_at desc, e.id desc)::text as mixed_order
from public.events e where e.user_id in (:'a', :'b') \gset
select tests.authenticate_as(:'b');
select is(
  pg_temp.page_through(3),
  :'mixed_order'::uuid[],
  'keyset pages of 3 interleave several users by time and id, every event once'
);
select is((select count(*)::int from public.get_feed(lim => 500)), 50, 'lim is capped at 50');
select throws_ok(
  'select * from public.get_feed(now(), null)',
  '22023',
  'invalid_cursor',
  'a half cursor is refused'
);
select is(
  (select count(*)::int from jsonb_object_keys((select h.skill_xp from public.get_hiscores() h where h.user_id = :'a'))),
  (select count(*)::int from public.skills),
  'hiscores list every skill'
);
select public.remove_friend(:'a');
select is((select count(*)::int from public.get_feed() f where f.user_id = :'a'), 0, 'an ex-friend sees no events');
select ok(not exists (select 1 from public.get_hiscores() h where h.user_id = :'a'), 'an ex-friend leaves hiscores');
reset role;

select is(
  pg_get_function_result('public.get_hiscores()'::regprocedure),
  'TABLE(user_id uuid, username text, display_name text, badge_color badge_color, is_self boolean, skill_xp jsonb, collection_filled integer, collection_total integer)',
  'hiscores return levels input only, with no weight or record column'
);

select * from finish();
rollback;
