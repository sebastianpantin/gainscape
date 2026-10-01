begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select tests.create_user('ac_pending', false) as pending \gset
select tests.create_user('ac_direct', false) as direct \gset
select tests.create_user('ac_taken') as taken \gset
update auth.users
set encrypted_password = extensions.crypt('squatter-password', extensions.gen_salt('bf')),
    confirmation_token = case when id = :'pending' then 'pending-token' else '' end
where id in (:'pending', :'direct');

update auth.users set email_confirmed_at = now(), confirmation_token = '' where id = :'pending';
select isnt(
  (select u.encrypted_password = extensions.crypt('squatter-password', u.encrypted_password) from auth.users u where u.id = :'pending'),
  true,
  'confirming an emailed signup rotates the password'
);
select ok(
  (select u.encrypted_password like '$2%' from auth.users u where u.id = :'pending'),
  'the rotated password is a bcrypt hash'
);

update auth.users set email_confirmed_at = now() where id = :'direct';
select ok(
  (select u.encrypted_password = extensions.crypt('squatter-password', u.encrypted_password) from auth.users u where u.id = :'direct'),
  'confirming a user without a pending confirmation email keeps the password'
);

update auth.users
set encrypted_password = extensions.crypt('kept-password', extensions.gen_salt('bf')), confirmation_token = 'again'
where id = :'pending';
update auth.users set email_confirmed_at = now() where id = :'pending';
select ok(
  (select u.encrypted_password = extensions.crypt('kept-password', u.encrypted_password) from auth.users u where u.id = :'pending'),
  'a later update of an already confirmed user keeps the password'
);

select tests.authenticate_as(:'pending');
select is(
  public.change_username('  AC_Owner '),
  jsonb_build_object('status', 'ok', 'username', 'ac_owner'),
  'a freshly confirmed user can change the username'
);
reset role;
select coalesce(sum(h.hits), 0)::int as hits_before from private.rate_limit_hits h
where h.bucket = 'username_check_minute' and h.subject = :'pending' \gset
select tests.authenticate_as(:'pending');
select is(public.change_username('ac_taken'), '{"status": "taken"}'::jsonb, 'a taken username is reported, not raised');
reset role;
select is(
  (select coalesce(sum(h.hits), 0)::int from private.rate_limit_hits h
   where h.bucket = 'username_check_minute' and h.subject = :'pending'),
  :hits_before + 1,
  'a taken attempt counts toward username_check_minute'
);
select tests.authenticate_as(:'pending');
select is(public.change_username('no'), '{"status": "invalid"}'::jsonb, 'an invalid username is reported');
select is(
  public.change_username('ac_owner'),
  jsonb_build_object('status', 'ok', 'username', 'ac_owner'),
  'keeping the current username is ok'
);
reset role;
select is(
  (select p.username || '/' || p.display_name from public.profiles p where p.id = :'pending'),
  'ac_owner/ac_owner',
  'the display name follows an unchanged default'
);

update auth.users set email_confirmed_at = now() - interval '2 hours' where id = :'pending';
select tests.authenticate_as(:'pending');
select is(
  public.change_username('ac_later'),
  '{"status": "closed"}'::jsonb,
  'the username is fixed an hour after confirmation'
);
reset role;

update auth.users set email_confirmed_at = null where id = :'taken';
select tests.authenticate_as(:'taken');
select throws_ok(
  $$select public.change_username('ac_unconfirmed')$$,
  '42501',
  'not_authenticated',
  'an unconfirmed user cannot change the username'
);
reset role;

select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.change_username('ac_anyone')$$, '42501', 'not_authenticated', 'no session, no change');

select * from finish();
rollback;
