begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.fill_bucket(bucket_name text, subject uuid) returns void language sql as $$
  insert into private.rate_limit_hits (bucket, subject, window_start, hits)
  select r.bucket, fill_bucket.subject,
         to_timestamp(floor(extract(epoch from now()) / r.window_seconds) * r.window_seconds), r.max_hits
  from private.rate_limit_rules r where r.bucket = fill_bucket.bucket_name
  on conflict (bucket, subject, window_start) do update set hits = excluded.hits;
$$;

select results_eq(
  $$select bucket, max_hits, window_seconds from private.rate_limit_rules
    where bucket in ('craft_minute', 'custom_exercise_save_hour', 'program_save_hour', 'pin_change_minute',
                     'profile_update_hour')
    order by bucket$$,
  $$values ('craft_minute', 30, 60), ('custom_exercise_save_hour', 30, 3600), ('pin_change_minute', 60, 60),
           ('profile_update_hour', 60, 3600), ('program_save_hour', 30, 3600)$$,
  'the client write buckets exist with their limits'
);

select tests.create_user('wr_alpha') as a \gset
select tests.create_user('wr_bravo') as b \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select id as shoulders from public.skills where key = 'shoulders' \gset
select id as template from public.programs where owner_user_id is null order by key limit 1 \gset

select tests.authenticate_as(:'a');
select lives_ok(
  format('insert into public.pinned_exercises (exercise_id, position) values (%L, 0)', :'bench'),
  'a pin under the limit is saved'
);
select lives_ok(
  format('update public.profiles set bio = %L where id = %L', 'first', :'a'),
  'a profile update under the limit is saved'
);
select lives_ok(
  format($$select public.save_custom_exercise(jsonb_build_object(
    'id', gen_random_uuid(), 'name', 'Limited press', 'loadType', 'external', 'equipment', 'other',
    'shares', jsonb_build_array(jsonb_build_object('skillId', %L, 'shareBp', 10000))))$$, :'shoulders'),
  'a custom exercise save under the limit is saved'
);
select lives_ok(
  format('select public.copy_program(%L, gen_random_uuid())', :'template'),
  'a program copy under the limit is saved'
);
reset role;

select pg_temp.fill_bucket('pin_change_minute', :'a');
select pg_temp.fill_bucket('profile_update_hour', :'a');
select pg_temp.fill_bucket('custom_exercise_save_hour', :'a');
select pg_temp.fill_bucket('program_save_hour', :'a');
select pg_temp.fill_bucket('craft_minute', :'a');

select tests.authenticate_as(:'a');
select throws_ok(
  format('insert into public.pinned_exercises (exercise_id, position) values (%L, 1)', :'squat'),
  'PT429', 'rate_limited', 'a pin over the limit is refused'
);
select throws_ok(
  format('update public.profiles set bio = %L where id = %L', 'second', :'a'),
  'PT429', 'rate_limited', 'a profile update over the limit is refused'
);
select throws_ok(
  format('update public.profile_private set unit_pref = %L where user_id = %L', 'lb', :'a'),
  'PT429', 'rate_limited', 'a private profile update over the limit is refused'
);
select throws_ok(
  format($$select public.save_custom_exercise(jsonb_build_object(
    'id', gen_random_uuid(), 'name', 'Over press', 'loadType', 'external', 'equipment', 'other',
    'shares', jsonb_build_array(jsonb_build_object('skillId', %L, 'shareBp', 10000))))$$, :'shoulders'),
  'PT429', 'rate_limited', 'a custom exercise save over the limit is refused'
);
select throws_ok(
  format('select public.copy_program(%L, gen_random_uuid())', :'template'),
  'PT429', 'rate_limited', 'a program copy over the limit is refused'
);
reset role;

select tests.authenticate_as(:'b');
select lives_ok(
  format('insert into public.pinned_exercises (exercise_id, position) values (%L, 0)', :'bench'),
  'another user keeps their own budget'
);
reset role;

select lives_ok(
  format('update public.profiles set bio = %L where id = %L', 'from the server', :'a'),
  'server-side writes, with no signed-in user, are never limited'
);
select ok(
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where c.relname = 'crafts' and t.tgname = 'limit_client_crafts' and not t.tgisinternal),
  'crafting is limited by a trigger on public.crafts'
);
select is(
  (select bio from public.profiles where id = :'a'),
  'from the server',
  'the refused client update left no trace and the server update applied'
);

select tests.create_user('wr_charlie') as c \gset
select tests.authenticate_as(:'c');
select lives_ok(
  format($$insert into public.pinned_exercises (exercise_id, position)
           select e.id, row_number() over (order by e.key) - 1 from public.exercises e
           where e.owner_user_id is null and e.id <> %L order by e.key limit 49$$, :'bench'),
  'a user can pin up to 49 exercises at once'
);
select lives_ok(
  format('select public.reorder_pins(array(select exercise_id from public.pinned_exercises where user_id = %L order by position desc))', :'c'),
  'reordering every pin is one change'
);
reset role;
select is(
  (select h.hits from private.rate_limit_hits h where h.bucket = 'pin_change_minute' and h.subject = :'c'),
  50,
  'the 49 pins and one reorder cost 50 hits, not one per moved pin'
);
select tests.authenticate_as(:'c');
select lives_ok(
  format('insert into public.pinned_exercises (exercise_id, position) values (%L, 49)', :'bench'),
  'the 50th pin is allowed'
);
reset role;
delete from private.rate_limit_hits where subject = :'c';
select tests.authenticate_as(:'c');
select throws_ok(
  format($$insert into public.pinned_exercises (exercise_id, position)
           select e.id, 50 from public.exercises e
           where e.owner_user_id is null
             and e.id not in (select exercise_id from public.pinned_exercises where user_id = %L)
           order by e.key limit 1$$, :'c'),
  'P0001', 'too_many_pins', 'a 51st pin is refused'
);
reset role;

select * from finish();
rollback;
