begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select tests.create_user('rpe_owner') as owner \gset
select tests.add_session(:'owner', now() - interval '1 hour') as s \gset

select col_type_is('public', 'sessions', 'session_rpe', 'smallint', 'a session stores its overall RPE as a small integer');
select col_is_null('public', 'sessions', 'session_rpe', 'the session RPE is optional');

select lives_ok(
  format('update public.sessions set session_rpe = 1 where id = %L', :'s'),
  'an RPE of 1 is the easiest session'
);
select lives_ok(
  format('update public.sessions set session_rpe = 10 where id = %L', :'s'),
  'an RPE of 10 is the hardest session'
);
select throws_ok(
  format('update public.sessions set session_rpe = 0 where id = %L', :'s'),
  '23514', 'new row for relation "sessions" violates check constraint "session_rpe_is_one_to_ten"',
  'an RPE below 1 is rejected'
);
select throws_ok(
  format('update public.sessions set session_rpe = 11 where id = %L', :'s'),
  '23514', 'new row for relation "sessions" violates check constraint "session_rpe_is_one_to_ten"',
  'an RPE above 10 is rejected'
);

select * from finish();
rollback;
