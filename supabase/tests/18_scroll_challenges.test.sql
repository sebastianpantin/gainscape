begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select tests.create_user('sc_owner') as owner \gset
select tests.create_user('sc_newcomer') as newcomer \gset
insert into public.exercises (owner_user_id, name, load_type, equipment)
values (:'owner', 'Owner secret lift', 'external', 'other');

select tests.add_session(:'owner', now() - interval '1 hour') as s \gset
select count(*)::int as built_in_variations from public.exercises
  where owner_user_id is null and variation_of_id is not null \gset

select hasnt_table('public', 'user_unlocks', 'the unlock table is gone');
select has_table('public', 'challenges', 'challenges have their own catalog table');
select policies_are('public', 'challenges', array['read challenges'], 'challenges have only the read policy');
select is(
  (select count(*)::int from public.challenges where retired_at is null),
  12,
  'the catalog seeds twelve challenges'
);
select hasnt_column('public', 'items', 'grants_exercise_id', 'a scroll no longer grants an exercise');
select is(
  (select count(*)::int from public.items i
   join public.challenges c on c.id = i.grants_challenge_id
   where i.kind = 'scroll'),
  (select count(*)::int from public.items i where i.kind = 'scroll'),
  'every scroll grants a challenge'
);
select throws_ok(
  $$insert into public.items (id, key, name, kind, rarity, icon_key, sort_order)
    values (gen_random_uuid(), 'blank_scroll', 'Blank scroll', 'scroll', 'rare', 'scroll', 999)$$,
  '23514', 'new row for relation "items" violates check constraint "scrolls_grant_a_challenge"',
  'a scroll without a challenge is rejected'
);
select col_is_null('public', 'sessions', 'challenge', 'a session challenge is optional');
select lives_ok(
  format('update public.sessions set challenge = %L where id = %L', '{"challengeId": "x"}', :'s'),
  'a session stores its challenge as an object'
);
select throws_ok(
  format('update public.sessions set challenge = %L where id = %L', '[]', :'s'),
  '23514', 'new row for relation "sessions" violates check constraint "session_challenge_is_object"',
  'a session challenge that is no object is rejected'
);
select ok(
  'challenge' = any(enum_range(null::public.ledger_reason)::text[]),
  'the item ledger records a challenge use'
);
select hasnt_column('public', 'exercises', 'requires_unlock', 'exercises no longer require an unlock');
select policies_are(
  'public', 'exercises',
  array['read built-in and own exercises'],
  'exercises have only the built-in and own read policy'
);

select tests.authenticate_as(:'newcomer');
select is(
  (select array_agg(e.key order by e.key) from public.exercises e
    where e.variation_of_id is not null
      and e.key = any(array['dead_stop_row', 'deficit_deadlift', 'pause_bench_press', 'pause_squat', 'spider_curl', 'z_press'])),
  array['dead_stop_row', 'deficit_deadlift', 'pause_bench_press', 'pause_squat', 'spider_curl', 'z_press'],
  'a new user sees all six former scroll variations'
);
select is(
  (select count(*)::int from public.exercises e where e.owner_user_id is null and e.variation_of_id is not null),
  :built_in_variations,
  'a new user sees every built-in variation'
);
select is(
  (select count(*)::int from public.challenges),
  12,
  'a signed-in user reads every challenge'
);
select is(
  (select count(*)::int from public.exercises e where e.name = 'Owner secret lift'),
  0,
  'a user cannot see another user''s custom exercise'
);
reset role;

select tests.authenticate_as(:'owner');
select is(
  (select count(*)::int from public.exercises e where e.name = 'Owner secret lift'),
  1,
  'the owner still sees their own custom exercise'
);
reset role;

select * from finish();
rollback;
