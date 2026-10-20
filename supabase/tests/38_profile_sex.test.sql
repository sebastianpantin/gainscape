begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select tests.create_user('sex_owner') as owner \gset
select tests.create_user('sex_friend') as friend \gset
select tests.create_user('sex_stranger') as stranger \gset
select tests.make_friends(:'owner', :'friend');

select has_column('public', 'profile_private', 'sex', 'profile_private has a sex column');
select col_is_null('public', 'profile_private', 'sex', 'sex is optional');
select is(
  (select sex from public.profile_private where user_id = :'owner'),
  null,
  'sex starts unset'
);
select ok(
  has_column_privilege('authenticated', 'public.profile_private', 'sex', 'update'),
  'authenticated may update sex'
);

select tests.authenticate_as(:'owner');
update public.profile_private set sex = 'female' where user_id = :'owner';
select is(
  (select sex from public.profile_private where user_id = :'owner'),
  'female',
  'the owner saves and reads their sex'
);
select throws_ok(
  format('update public.profile_private set sex = %L where user_id = %L', 'other', :'owner'),
  '23514',
  null,
  'only male or female is allowed'
);
update public.profile_private set sex = null where user_id = :'owner';
select is(
  (select sex from public.profile_private where user_id = :'owner'),
  null,
  'the owner can clear their sex'
);
update public.profile_private set sex = 'male' where user_id = :'owner';
reset role;

select tests.authenticate_as(:'friend');
select is(
  (select count(*)::int from public.profile_private where user_id = :'owner'),
  0,
  'a friend cannot read the owner''s sex'
);
reset role;

select tests.authenticate_as(:'stranger');
select is(
  (select count(*)::int from public.profile_private where user_id = :'owner'),
  0,
  'a stranger cannot read the owner''s sex'
);
update public.profile_private set sex = 'female' where user_id = :'owner';
reset role;
select is(
  (select sex from public.profile_private where user_id = :'owner'),
  'male',
  'a stranger cannot change the owner''s sex'
);

select * from finish();
rollback;
