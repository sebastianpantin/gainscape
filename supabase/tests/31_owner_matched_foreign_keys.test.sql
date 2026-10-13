begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is(
  (
    select array_agg(c.conname::text order by c.conname)
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and c.confrelid <> 'public.profiles'::regclass
      and c.conname <> 'reactions_event_id_fkey'
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'user_id' and not a.attisdropped
      )
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.confrelid and a.attname = 'user_id' and not a.attisdropped
      )
      and not exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.conrelid and a.attname = 'user_id' and a.attnum = any(c.conkey)
      )
  ),
  null,
  'every foreign key between two user-owned tables also matches user_id, except reactions on a friend''s event'
);

select tests.create_user('fk_owner') as owner \gset
select tests.create_user('fk_other') as other \gset
select tests.give_everything(:'owner', :'other');
select id as owner_session from public.sessions where user_id = :'owner' limit 1 \gset
select id as owner_set from public.sets where user_id = :'owner' limit 1 \gset
select id as owner_roll from public.loot_rolls where user_id = :'owner' limit 1 \gset
select id as lift from public.exercises where key is not null and load_type = 'external' order by key limit 1 \gset
select id as other_skill from public.skills
where id not in (select skill_id from public.set_skill_xp where set_id = :'owner_set') limit 1 \gset

select throws_ok(
  format(
    $$insert into public.sets
        (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir_source, effective_reps, xp_awarded)
      values (gen_random_uuid(), %L, %L, %L, 90, 60, 60, 5, 'default', 5, 10)$$,
    :'owner_session', :'other', :'lift'
  ),
  '23503', null,
  'a set cannot belong to someone else''s session'
);
select throws_ok(
  format(
    $$insert into public.set_skill_xp (set_id, skill_id, user_id, xp) values (%L, %L, %L, 1)$$,
    :'owner_set', :'other_skill', :'other'
  ),
  '23503', null,
  'set XP cannot belong to someone else''s set'
);
select throws_ok(
  format(
    $$insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (%L, %L, 'level:fk', 'level_up', now(), '{"skill": "back", "from": 1, "to": 2}')$$,
    :'other', :'owner_session'
  ),
  '23503', null,
  'an event cannot belong to someone else''s session'
);
select throws_ok(
  format(
    $$update public.drops set user_id = %L where loot_roll_id = %L$$,
    :'other', :'owner_roll'
  ),
  '23503', null,
  'a drop cannot move away from its loot roll''s owner'
);
select throws_ok(
  format(
    $$insert into public.exercise_maxes (user_id, exercise_id, e1rm_kg, source_set_id) values (%L, %L, 70, %L)$$,
    :'other', :'lift', :'owner_set'
  ),
  '23503', null,
  'a strength record cannot point at someone else''s set'
);
select throws_ok(
  format(
    $$insert into public.cardio_records (user_id, exercise_id, kind, value, achieved_at, set_id)
      select %L, e.id, 'duration', 60, now(), %L from public.exercises e where e.key = 'running'$$,
    :'other', :'owner_set'
  ),
  '23503', null,
  'a cardio record cannot point at someone else''s set'
);

update public.exercise_maxes set source_set_id = :'owner_set' where user_id = :'owner';
delete from public.sets where id = :'owner_set';
select is(
  (select count(*)::int from public.exercise_maxes where user_id = :'owner' and source_set_id is null),
  1,
  'deleting a set clears the record''s link to it and keeps the record'
);
select is(
  (select count(*)::int from public.set_skill_xp where set_id = :'owner_set'),
  0,
  'deleting a set still removes its XP'
);

select * from finish();
rollback;
