begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

select tests.create_user('fr_alpha') as a \gset
select tests.create_user('b_name') as b \gset
select tests.create_user('fr_charlie') as c \gset
select tests.create_user('fr_ghost', false) as ghost \gset
select tests.create_user('fr_banned') as banned \gset
update auth.users set banned_until = now() + interval '1 day' where id = :'banned';

select tests.authenticate_as(:'a');
select is(public.send_friend_request('  B_Name ') ->> 'status', 'sent', 'a request by a padded, mixed-case name is sent');
select is(
  public.send_friend_request('fr_charlie') -> 'friend',
  jsonb_build_object('userId', :'c'::uuid, 'username', 'fr_charlie', 'displayName', 'fr_charlie', 'badgeColor', 'gold'),
  'a sent request returns the public card'
);
select throws_ok('select * from public.friendships', '42501', null, 'the requester cannot read friendships');
reset role;
select is(
  (select f.status::text from public.friendships f where f.requester_id = :'a' and f.addressee_id = :'b'),
  'pending',
  'the request is stored as pending'
);

select tests.authenticate_as(:'b');
select throws_ok('select * from public.friendships', '42501', null, 'the addressee cannot read friendships');
select results_eq(
  'select user_id, relation from public.list_friends()',
  format('values (%L::uuid, %L::text)', :'a', 'incoming'),
  'the addressee sees an incoming request'
);
reset role;

select tests.authenticate_as(:'c');
select throws_ok('select * from public.friendships', '42501', null, 'a third user cannot read friendships');
reset role;

select tests.authenticate_as(:'a');
select results_eq(
  'select user_id, relation from public.list_friends()',
  format('values (%L::uuid, %L::text), (%L::uuid, %L::text)', :'b', 'outgoing', :'c', 'outgoing'),
  'the requester sees outgoing requests'
);
select is(public.send_friend_request('b_name') ->> 'status', 'already_pending', 'a repeated request is already pending');
select is(public.send_friend_request('b_name') -> 'friend', null, 'already_pending carries no card');
reset role;
select is(
  (select count(*)::int from public.friendships f where :'a' in (f.requester_id, f.addressee_id) and :'b' in (f.requester_id, f.addressee_id)),
  1,
  'a repeated request keeps one row'
);

select tests.authenticate_as(:'b');
select is(public.send_friend_request('fr_alpha') ->> 'status', 'accepted', 'a crossed request accepts');
select is(public.send_friend_request('fr_alpha') ->> 'status', 'already_friends', 'friends are already friends');
reset role;
select ok(
  (select f.status = 'accepted' and f.responded_at is not null from public.friendships f
   where f.requester_id = :'a' and f.addressee_id = :'b'),
  'the crossed request leaves one accepted row with responded_at'
);

select tests.authenticate_as(:'a');
select lives_ok(format('select public.remove_friend(%L)', :'b'), 'remove_friend removes a friend');
select lives_ok(format('select public.remove_friend(%L)', :'b'), 'remove_friend is idempotent');
reset role;
select is(
  (select count(*)::int from public.friendships f where :'b' in (f.requester_id, f.addressee_id)),
  0,
  'the friendship is gone'
);

select tests.authenticate_as(:'a');
select is(public.send_friend_request('b_name') ->> 'status', 'sent', 'a new request after removal is sent');
reset role;
select tests.authenticate_as(:'b');
select is(
  public.respond_friend_request(:'a', false) ->> 'status',
  'declined',
  'the addressee declines'
);
select is((select count(*)::int from public.list_friends()), 0, 'a declined request leaves the addressee list');
reset role;
select is(
  (select f.status::text from public.friendships f where f.requester_id = :'a' and f.addressee_id = :'b'),
  'declined',
  'a declined request keeps a declined row'
);
select tests.authenticate_as(:'a');
select is(public.send_friend_request('b_name') ->> 'status', 'already_pending', 'a re-request after a decline looks pending');
select results_eq(
  'select user_id, relation from public.list_friends()',
  format('values (%L::uuid, %L::text), (%L::uuid, %L::text)', :'b', 'outgoing', :'c', 'outgoing'),
  'the requester cannot tell a decline from a pending request'
);
select is(public.send_friend_request('fr_alpha') ->> 'status', 'self', 'a request to yourself is refused');
select is(public.send_friend_request('fr_ghost') ->> 'status', 'not_found', 'an unconfirmed user cannot be found');
select is(public.send_friend_request('fr_banned') ->> 'status', 'not_found', 'a banned user cannot be found');
select is(public.send_friend_request('nobody_here') ->> 'status', 'not_found', 'a missing user cannot be found');
select throws_ok(
  format('select public.respond_friend_request(%L, true)', :'c'),
  'P0002',
  'request_not_found',
  'the requester cannot answer their own request'
);
reset role;

select tests.authenticate_as(:'b');
select public.remove_friend(:'a');
reset role;
select ok(
  (select f.status = 'declined' and f.withdrawn_at is null from public.friendships f
   where f.requester_id = :'a' and f.addressee_id = :'b'),
  'the addressee removing a declined request leaves it looking pending'
);
select tests.authenticate_as(:'a');
select public.remove_friend(:'b');
reset role;
select ok(
  (select f.withdrawn_at is not null from public.friendships f where f.requester_id = :'a' and f.addressee_id = :'b'),
  'cancelling a declined request withdraws it instead of deleting it'
);
select tests.authenticate_as(:'a');
select results_eq(
  'select user_id from public.list_friends()',
  format('values (%L::uuid)', :'c'),
  'a withdrawn request leaves the requester list'
);
select is(public.send_friend_request('b_name') ->> 'status', 'already_pending', 're-sending a withdrawn request stays quiet');
reset role;
select ok(
  (select f.status = 'declined' and f.withdrawn_at is null from public.friendships f
   where f.requester_id = :'a' and f.addressee_id = :'b'),
  're-sending restores the declined row without notifying'
);
select tests.authenticate_as(:'a');
select public.remove_friend(:'b');
reset role;
select tests.authenticate_as(:'b');
select is(public.send_friend_request('fr_alpha') ->> 'status', 'sent', 'the addressee can still ask after a withdrawal');
reset role;
select ok(
  exists (select 1 from public.friendships f where f.requester_id = :'b' and f.addressee_id = :'a' and f.status = 'pending')
  and not exists (select 1 from public.friendships f where f.requester_id = :'a' and f.addressee_id = :'b'),
  'the withdrawn row is replaced by a fresh request'
);

insert into public.friendships (requester_id, addressee_id) values (:'banned', :'c');
insert into public.friendships (requester_id, addressee_id, status, responded_at) values (:'banned', :'b', 'accepted', now());
select tests.authenticate_as(:'c');
select throws_ok(
  format('select public.respond_friend_request(%L, true)', :'banned'),
  'P0002',
  'request_not_found',
  'a banned requester cannot be accepted'
);
select ok(
  not exists (select 1 from public.list_friends() l where l.user_id = :'banned'),
  'an incoming request from a banned user is hidden'
);
reset role;
select tests.authenticate_as(:'b');
select ok(
  not exists (select 1 from public.list_friends() l where l.user_id = :'banned'),
  'a banned friend is hidden'
);
select is(public.get_profile(:'banned'), null, 'a banned friend profile is hidden');
reset role;
select tests.authenticate_as(:'banned');
select throws_ok('select public.send_friend_request(''fr_charlie'')', '42501', 'not_authenticated', 'a banned caller cannot send');
select throws_ok(
  format('select public.respond_friend_request(%L, true)', :'b'),
  '42501',
  'not_authenticated',
  'a banned caller cannot accept'
);
reset role;

select tests.create_user('fr_many') as many \gset
insert into public.friendships (requester_id, addressee_id)
select :'many', tests.create_user('fr_out_' || n) from generate_series(1, 49) n;
insert into public.friendships (requester_id, addressee_id, status, responded_at, withdrawn_at)
values (:'many', tests.create_user('fr_out_withdrawn'), 'declined', now(), now());
select tests.authenticate_as(:'many');
select is(public.send_friend_request('fr_charlie') ->> 'status', 'sent', 'a withdrawn request does not count toward the cap');
select is(public.send_friend_request('b_name') ->> 'status', 'limit_reached', 'the 51st outgoing request is refused');
reset role;

select tests.create_user('fr_popular') as popular \gset
insert into public.friendships (requester_id, addressee_id, status, responded_at)
select tests.create_user('fr_in_' || n), :'popular', 'accepted', now() from generate_series(1, 200) n;
insert into public.friendships (requester_id, addressee_id) values (:'c', :'popular');
select tests.authenticate_as(:'popular');
select throws_ok(
  format('select public.respond_friend_request(%L, true)', :'c'),
  '23514',
  'friend_limit_reached',
  'accepting a 201st friend is refused'
);
select is(
  public.send_friend_request('fr_charlie') ->> 'status',
  'limit_reached',
  'a crossed request is refused at the friend cap'
);
reset role;

select tests.create_user('fr_spammer') as spammer \gset
select tests.authenticate_as(:'spammer');
select is(public.send_friend_request('missing_0') ->> 'status', 'not_found', 'a miss still answers');
reset role;
select is(
  (select sum(h.hits)::int from private.rate_limit_hits h where h.subject = :'spammer' and h.bucket = 'friend_request_minute'),
  1,
  'a miss counts against the limit'
);
select tests.authenticate_as(:'spammer');
select lives_ok(
  'select public.send_friend_request(''missing_'' || n) from generate_series(1, 29) n',
  'thirty requests within a minute pass'
);
select throws_ok('select public.send_friend_request(''missing_31'')', 'PT429', 'rate_limited', 'the 31st request is rate limited');
reset role;

set local role anon;
select throws_ok('select public.send_friend_request(''b_name'')', '42501', null, 'anon cannot send requests');
select throws_ok(format('select public.respond_friend_request(%L, true)', :'a'), '42501', null, 'anon cannot respond');
select throws_ok(format('select public.remove_friend(%L)', :'a'), '42501', null, 'anon cannot remove friends');
select throws_ok('select * from public.list_friends()', '42501', null, 'anon cannot list friends');
select throws_ok(format('select public.get_profile(%L)', :'a'), '42501', null, 'anon cannot read profiles');
select throws_ok(format('select public.get_collection(%L)', :'a'), '42501', null, 'anon cannot read collections');
reset role;

select * from finish();
rollback;
