begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

select * from finish();
rollback;
