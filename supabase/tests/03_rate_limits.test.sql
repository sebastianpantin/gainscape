begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values ('test_five', 5, 3600);

create temporary table actors (name text primary key, id uuid not null) on commit drop;
insert into actors values ('a', tests.create_user('rl_alpha')), ('b', tests.create_user('rl_bravo'));
grant select on actors to authenticated;

select lives_ok(
  $$ select private.take_rate_limit('test_five', (select id from actors where name = 'a'))
     from generate_series(1, 5) $$,
  'five takes within a limit of five pass'
);

select throws_ok(
  $$ select private.take_rate_limit('test_five', (select id from actors where name = 'a')) $$,
  'PT429',
  'rate_limited',
  'the sixth take is rate limited'
);

create function pg_temp.rate_limit_detail() returns jsonb language plpgsql as $$
declare
  detail text;
begin
  perform private.take_rate_limit('test_five', (select id from actors where name = 'a'));
  return null;
exception when sqlstate 'PT429' then
  get stacked diagnostics detail = pg_exception_detail;
  return detail::jsonb;
end;
$$;

select is(pg_temp.rate_limit_detail() ->> 'bucket', 'test_five', 'the detail names the bucket');
select ok(
  (pg_temp.rate_limit_detail() ->> 'retryAfterSeconds')::int between 1 and 3600,
  'retryAfterSeconds lies within the window'
);

select is(
  (select h.hits from private.rate_limit_hits h
   where h.bucket = 'test_five' and h.subject = (select id from actors where name = 'a')),
  5,
  'rejected takes are not recorded'
);

select lives_ok(
  $$ select private.take_rate_limit('test_five', (select id from actors where name = 'b')) $$,
  'another subject has its own counter'
);

insert into private.rate_limit_hits (bucket, subject, window_start, hits)
select 'test_five', id, now() - interval '2 hours', 3 from actors where name = 'b';
select private.take_rate_limit('test_five', (select id from actors where name = 'b'));
select is(
  (select count(*)::int from private.rate_limit_hits h
   where h.bucket = 'test_five' and h.subject = (select id from actors where name = 'b')),
  1,
  'an older window is deleted on the next take'
);

select throws_ok(
  $$ select private.take_rate_limit('no_such_bucket', (select id from actors where name = 'a')) $$,
  '22023',
  'unknown_rate_limit_bucket',
  'an unknown bucket is refused'
);

select tests.authenticate_as((select id from actors where name = 'a'));
select throws_ok(
  $$ select private.take_rate_limit('test_five', (select id from actors where name = 'a')) $$,
  '42501',
  null,
  'authenticated cannot execute take_rate_limit'
);
reset role;

select ok(
  not has_table_privilege('authenticated', 'private.rate_limit_hits', 'select, insert, update, delete'),
  'authenticated has no privilege on rate_limit_hits'
);
select ok(
  not has_table_privilege('authenticated', 'private.rate_limit_rules', 'select, insert, update, delete'),
  'authenticated has no privilege on rate_limit_rules'
);

select ok(
  not has_table_privilege('authenticated', 'private.anon_rate_limit_hits', 'select, insert, update, delete'),
  'authenticated has no privilege on anon_rate_limit_hits'
);

select set_config('request.jwt.claims', '', true);
set local role anon;
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1"}', true);
select lives_ok(
  $$ select public.username_available('free_' || n) from generate_series(1, 120) n $$,
  '120 anonymous checks from one client pass'
);
select throws_ok(
  $$ select public.username_available('free_121') $$,
  'PT429',
  'rate_limited',
  'the 121st check from that client is limited'
);
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.7, 10.0.0.1"}', true);
select throws_ok(
  $$ select public.username_available('free_122') $$,
  'PT429',
  'rate_limited',
  'a different left-most hop does not escape the limit of the proxy-added hop'
);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.2"}', true);
select lives_ok($$ select public.username_available('free_123') $$, 'another client keeps its own bucket');
select set_config('request.headers', '{}', true);
select lives_ok($$ select public.username_available('free_124') $$, 'a request without a client address still passes');
reset role;

select is(
  (select count(distinct h.client_key)::int from private.anon_rate_limit_hits h
   where h.bucket = 'username_check_anon_minute'
     and h.client_key in (private.client_key('10.0.0.1'), private.client_key('10.0.0.2'))),
  2,
  'two clients are counted apart'
);
select is(
  (select h.hits from private.anon_rate_limit_hits h
   where h.bucket = 'username_check_anon_global_minute' and h.client_key = private.client_key(null)
     and h.window_start = to_timestamp(floor(extract(epoch from now()) / 60) * 60)),
  1,
  'a request without a client address counts against the global backstop'
);

select isnt(private.client_key('10.0.0.1'), sha256(convert_to('10.0.0.1', 'UTF8')), 'client keys are peppered');

insert into private.anon_rate_limit_hits (bucket, client_key, window_start, hits)
values ('username_check_anon_minute', private.client_key('192.0.2.50'), now() - interval '10 minutes', 7);
select set_config('request.jwt.claims', '', true);
set local role anon;
select set_config('request.headers', '{"x-forwarded-for": "192.0.2.51"}', true);
select public.username_available('free_125');
reset role;
select is(
  (select count(*)::int from private.anon_rate_limit_hits h
   where h.bucket = 'username_check_anon_minute' and h.window_start < to_timestamp(floor(extract(epoch from now()) / 60) * 60)),
  0,
  'a take clears stale windows of every client in the bucket'
);

select set_config('request.headers', '{"x-forwarded-for": "198.51.100.1, 203.0.113.7, 10.0.0.9"}', true);
select is(private.request_client_ip(), '10.0.0.9', 'by default the right-most hop is the client');
update private.client_ip_config set trusted_hops_from_right = 1;
select is(private.request_client_ip(), '203.0.113.7', 'one trusted hop skips the proxy-added address');
update private.client_ip_config set trusted_hops_from_right = 3;
select is(private.request_client_ip(), null, 'skipping past the left-most hop gives no address');
update private.client_ip_config set header_name = 'cf-connecting-ip', trusted_hops_from_right = 0;
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.1, 10.0.0.9", "cf-connecting-ip": " 203.0.113.44 "}', true);
select is(private.request_client_ip(), '203.0.113.44', 'another header is taken as it is');
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.1"}', true);
select is(private.request_client_ip(), null, 'a missing configured header gives no address');

select * from finish();
rollback;
