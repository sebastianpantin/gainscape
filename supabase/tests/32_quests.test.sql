begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select tests.create_user('qs_owner') as owner \gset
select tests.create_user('qs_stranger') as stranger \gset
select tests.add_session(:'owner', now() - interval '2 hours') as owner_session \gset
select tests.add_session(:'owner', now() - interval '1 hour') as anchor_session \gset
select id as legs from public.skills where key = 'legs' \gset
select id as core from public.skills where key = 'core' \gset

insert into public.quests (id, key, name, description, quest_points, sort_order, definition)
values
  (gen_random_uuid(), 'qs_first', 'Qs First', 'The first test quest.', 2, 900,
   '{"requiredLevels": [], "requiredQuestIds": [], "steps": [{"kind": "record", "exerciseId": null}], "rewardXp": {}}'),
  (gen_random_uuid(), 'qs_second', 'Qs Second', 'The second test quest.', 3, 901,
   '{"requiredLevels": [], "requiredQuestIds": [], "steps": [{"kind": "record", "exerciseId": null}], "rewardXp": {}}');
select id as first_quest from public.quests where key = 'qs_first' \gset
select id as second_quest from public.quests where key = 'qs_second' \gset

insert into public.quest_progress (user_id, quest_id) values (:'owner', :'second_quest');
insert into public.quest_completions
  (user_id, quest_id, started_at, session_id, anchor_started_at, anchor_session_id, quest_points)
select :'owner', :'first_quest', now() - interval '3 hours', :'owner_session', s.started_at, s.id, 2
from public.sessions s where s.id = :'anchor_session';
insert into public.quest_completion_xp (user_id, quest_id, skill_id, xp)
values (:'owner', :'first_quest', :'legs', 800), (:'owner', :'first_quest', :'core', 200);

select has_table('public', 'quests', 'quests have their own catalog table');
select policies_are('public', 'quests', array['read quests'], 'quests have only the read policy');
select policies_are('public', 'quest_progress', array['read own quest progress'], 'progress is read by its owner only');
select policies_are(
  'public', 'quest_completions', array['read own quest completions'], 'completions are read by their owner only'
);
select policies_are(
  'public', 'quest_completion_xp', array['read own quest completion xp'], 'quest XP is read by its owner only'
);
select ok('quest' = any(enum_range(null::public.event_type)::text[]), 'a feed event can be a quest');

select throws_ok(
  $$insert into public.quests (id, key, name, description, quest_points, sort_order, definition)
    values (gen_random_uuid(), 'qs_greedy', 'Qs Greedy', 'Too many points.', 11, 902, '{}')$$,
  '23514', null,
  'a quest is worth at most ten quest points'
);
select throws_ok(
  $$insert into public.quests (id, key, name, description, quest_points, sort_order, definition)
    values (gen_random_uuid(), 'qs_blank', 'Qs Blank', '', 1, 902, '{}')$$,
  '23514', null,
  'a quest needs a description'
);
select throws_ok(
  $$insert into public.quests (id, key, name, description, quest_points, sort_order, definition)
    values (gen_random_uuid(), 'qs_list', 'Qs List', 'A list definition.', 1, 902, '[]')$$,
  '23514', null,
  'a quest definition is an object'
);
select throws_ok(
  $$insert into public.quests (id, key, name, description, quest_points, sort_order, definition)
    values (gen_random_uuid(), 'qs_again', 'QS FIRST', 'Same name, other case.', 1, 902, '{}')$$,
  '23505', null,
  'quest names are unique regardless of case'
);
select throws_ok(
  format('update public.quest_progress set step_progress = -1 where user_id = %L', :'owner'),
  '23514', null,
  'step progress is never negative'
);
select throws_ok(
  format(
    'insert into public.quest_completion_xp (user_id, quest_id, skill_id, xp) select %L, %L, s.id, 0
     from public.skills s where s.key = ''back''',
    :'owner', :'first_quest'
  ),
  '23514', null,
  'quest XP rows are positive'
);

select throws_ok(
  format('update public.quest_completions set quest_points = 10 where user_id = %L', :'owner'),
  '23001', null,
  'a completion cannot change'
);
select throws_ok(
  format('delete from public.quest_completions where user_id = %L', :'owner'),
  '23001', null,
  'a completion cannot be deleted'
);
select throws_ok('truncate public.quest_completions cascade', '23001', null, 'completions cannot be truncated');
select throws_ok(
  format('update public.quest_completion_xp set xp = 5000 where user_id = %L', :'owner'),
  '23001', null,
  'quest XP cannot change'
);
select throws_ok(
  format('delete from public.quest_completion_xp where user_id = %L', :'owner'),
  '23001', null,
  'quest XP cannot be deleted'
);
select throws_ok('truncate public.quest_completion_xp', '23001', null, 'quest XP cannot be truncated');

delete from public.sessions where id = :'owner_session';
select is(
  (select count(*)::int from public.quest_completions where user_id = :'owner' and session_id is null),
  1,
  'deleting the completing session only clears the completion''s link to it'
);

select throws_ok(
  format(
    $$insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (%L, null, 'level:legs', 'level_up', now(), '{"skill": "legs", "from": 1, "to": 2}')$$,
    :'owner'
  ),
  '23514', null,
  'a session event needs its session'
);
select throws_ok(
  format(
    $$insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (%L, %L, 'quest:qs_first', 'quest', now(), '{}')$$,
    :'owner', :'anchor_session'
  ),
  '23514', null,
  'a quest event belongs to no session'
);
select throws_ok(
  format(
    $$insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (%L, null, 'quest:Qs First', 'quest', now(), '{}')$$,
    :'owner'
  ),
  '23514', null,
  'a quest event key is a quest key'
);
select lives_ok(
  format(
    $$insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (%L, null, 'quest:qs_first', 'quest', now(), %L)$$,
    :'owner',
    jsonb_build_object(
      'questId', :'first_quest', 'questKey', 'qs_first', 'name', 'Old name', 'questPoints', 2,
      'levelUps', jsonb_build_array(jsonb_build_object('skill', 'legs', 'from', 1, 'to', 3)))
  ),
  'a quest event is stored without a session'
);
select throws_ok(
  format(
    $$insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (%L, null, 'quest:qs_first', 'quest', now(), '{}')$$,
    :'owner'
  ),
  '23505', null,
  'a user completes a quest into the feed once'
);
select lives_ok(
  format(
    $$insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (%L, null, 'quest:qs_first', 'quest', now(), '{}')$$,
    :'stranger'
  ),
  'another user can complete the same quest'
);

select is(
  private.feed_payload(
    'quest',
    (select e.payload from public.events e where e.user_id = :'owner' and e.event_key = 'quest:qs_first'),
    true,
    true),
  jsonb_build_object(
    'questId', :'first_quest', 'questKey', 'qs_first', 'questName', 'Qs First', 'questPoints', 2,
    'levelUps', jsonb_build_array(jsonb_build_object('skill', 'legs', 'skillName', 'Legs', 'from', 1, 'to', 3))),
  'the feed shows the quest name, points and the levels it reached'
);
select is(
  private.feed_payload(
    'quest',
    jsonb_build_object(
      'questId', '00000000-0000-0000-0000-000000000000', 'questKey', 'gone', 'name', 'Gone quest', 'questPoints', 1),
    false,
    false),
  jsonb_build_object(
    'questId', '00000000-0000-0000-0000-000000000000', 'questKey', 'gone', 'questName', 'Gone quest',
    'questPoints', 1, 'levelUps', '[]'::jsonb),
  'a quest missing from the catalog keeps its stored name and shows no levels'
);

select is(
  (select max_hits from private.rate_limit_rules where bucket = 'quest_start_hour'),
  30,
  'starting quests is limited to thirty an hour'
);
select is(
  (select window_seconds from private.rate_limit_rules where bucket = 'quest_start_hour'),
  3600,
  'the quest start window is an hour'
);

select tests.authenticate_as(:'owner');
select is((select count(*)::int from public.quest_progress), 1, 'the owner reads their quest progress');
select is((select count(*)::int from public.quest_completions), 1, 'the owner reads their completions');
select is((select count(*)::int from public.quest_completion_xp), 2, 'the owner reads their quest XP');
select is(
  (public.get_profile(:'owner') -> 'questPoints')::int,
  2,
  'the profile counts the quest points of completed quests'
);
select throws_ok(
  format('insert into public.quest_progress (user_id, quest_id) values (%L, %L)', :'owner', :'first_quest'),
  '42501', null,
  'a client cannot start a quest by writing progress'
);
select throws_ok(
  format(
    'insert into public.quest_completions (user_id, quest_id, started_at, anchor_started_at, anchor_session_id, quest_points)
     values (%L, %L, now(), now(), gen_random_uuid(), 3)',
    :'owner', :'second_quest'
  ),
  '42501', null,
  'a client cannot complete a quest by writing it'
);
reset role;

select tests.authenticate_as(:'stranger');
select is(
  (select count(*)::int from public.quest_progress) + (select count(*)::int from public.quest_completions)
    + (select count(*)::int from public.quest_completion_xp),
  0,
  'a stranger reads none of the owner''s quest rows'
);
select is(
  (public.get_profile(:'stranger') -> 'questPoints')::int,
  0,
  'a profile without completed quests has no quest points'
);
reset role;

select tests.authenticate_as(:'owner');
select public.reset_account_data('RESET');
reset role;
select is(
  (select count(*)::int from public.quest_progress where user_id = :'owner')
    + (select count(*)::int from public.quest_completions where user_id = :'owner')
    + (select count(*)::int from public.quest_completion_xp where user_id = :'owner')
    + (select count(*)::int from public.events where user_id = :'owner'),
  0,
  'a reset wipes the caller''s quests and quest events'
);

select * from finish();
rollback;
