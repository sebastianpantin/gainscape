begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select tests.create_user('pc_owner') as a \gset
select tests.create_user('pc_friend') as b \gset
select tests.create_user('pc_stranger') as c \gset
select tests.create_user('pc_pending') as p \gset
select tests.make_friends(:'a', :'b');
insert into public.friendships (requester_id, addressee_id) values (:'p', :'a');

select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select id as pull_up from public.exercises where key = 'pull_up' \gset
select tests.add_session(:'a', now() - interval '1 hour') as s \gset

insert into public.exercises (id, name, load_type, equipment, owner_user_id)
values (gen_random_uuid(), 'Secret sled', 'external', 'other', :'a')
returning id as custom \gset
insert into public.exercise_skills (exercise_id, skill_id, share_bp)
select :'custom', s.id, 10000 from public.skills s where s.key = 'legs';
insert into public.sets
  (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir, rir_source, effective_reps, xp_awarded)
values (gen_random_uuid(), :'s', :'a', :'bench', 0, 97, 97, 3, 2, 'logged', 3, 0)
returning id as set_id \gset

insert into public.rep_maxes (user_id, exercise_id, reps, load_kg, set_id, achieved_at, exact_set_id)
select :'a', :'bench', r, 100 - r, null, now(), case when r <= 3 then :'set_id'::uuid end
from generate_series(1, 5) r;
insert into public.rep_maxes (user_id, exercise_id, reps, load_kg, set_id, achieved_at, exact_set_id)
values (:'a', :'custom', 1, 150, null, now(), null);
insert into public.bodyweight_rep_records (user_id, exercise_id, max_reps, set_id, achieved_at)
values (:'a', :'pull_up', 12, null, now());
insert into public.pinned_exercises (user_id, exercise_id, position) values (:'a', :'squat', 0);

create temporary table profile_keys (key text) on commit drop;
insert into profile_keys values
  ('userId'), ('username'), ('displayName'), ('bio'), ('trainingFocus'), ('trainingSince'), ('badgeColor'),
  ('joinedAt'), ('showWeights'), ('relation'), ('friendsSince'), ('skillXp'), ('collection');
grant select on profile_keys to authenticated;

select tests.authenticate_as(:'a');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.get_profile(:'a')) k),
  (select array_agg(key order by key) from profile_keys),
  'the self profile has exactly the allowlisted keys'
);
select is(public.get_profile(:'a') ->> 'relation', 'self', 'the owner sees relation self');
select is(
  public.get_profile(:'a') -> 'collection',
  '{"filledSlots": 4, "totalSlots": 31}'::jsonb,
  'the collection counts pinned and done exercises'
);
select is(
  (select count(*)::int from jsonb_object_keys(public.get_profile(:'a') -> 'skillXp')),
  (select count(*)::int from public.skills),
  'skillXp lists every skill'
);
select is(
  (select jsonb_agg(e -> 'name' order by e ->> 'exerciseId') from jsonb_array_elements(public.get_collection(:'a') -> 'exercises') e
   where e ->> 'exerciseId' = :'custom'),
  '["Secret sled"]'::jsonb,
  'the owner sees their own custom exercise name'
);
reset role;

select tests.authenticate_as(:'b');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.get_profile(:'a')) k),
  (select array_agg(key order by key) from profile_keys),
  'the friend profile has exactly the allowlisted keys'
);
select ok(
  not exists (
    select 1 from jsonb_object_keys(public.get_profile(:'a')) k
    where k in ('bodyweightKg', 'heightCm', 'birthYear', 'timezone', 'unitPref', 'effortInputMode', 'email')
  ),
  'the profile carries no private field'
);
select is(public.get_profile(:'a') ->> 'relation', 'friend', 'a friend sees relation friend');
select isnt(public.get_profile(:'a') ->> 'friendsSince', null, 'a friend sees since when');
select is(
  (select jsonb_agg((r ->> 'loadKg')::numeric order by (r ->> 'reps')::int)
   from jsonb_array_elements(public.get_collection(:'a') -> 'exercises') e, jsonb_array_elements(e -> 'repMaxes') r
   where e ->> 'exerciseId' = :'bench'),
  '[99, 98, 97, 96, 95]'::jsonb,
  'a friend sees the loads while weights are shown'
);
select is(
  (select jsonb_agg(e -> 'name') from jsonb_array_elements(public.get_collection(:'a') -> 'exercises') e
   where e ->> 'exerciseId' = :'custom'),
  '["Custom exercise"]'::jsonb,
  'a friend sees a custom exercise without its name'
);
select is(
  (select jsonb_agg(e ->> 'exerciseId') from jsonb_array_elements(public.get_collection(:'a') -> 'exercises') e
   where (e ->> 'pinned')::boolean),
  jsonb_build_array(:'squat'::text),
  'pins are reported'
);
reset role;

update public.profiles set show_weights = false where id = :'a';
select tests.authenticate_as(:'b');
select ok((public.get_collection(:'a') ->> 'weightsHidden')::boolean, 'weightsHidden is set for the friend');
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.get_collection(:'a') -> 'exercises') e,
                  jsonb_array_elements(e -> 'repMaxes') r
    where r ->> 'loadKg' is not null
  ),
  'every load is hidden from the friend'
);
reset role;
select tests.authenticate_as(:'a');
select is(
  (select count(*)::int from jsonb_array_elements(public.get_collection(:'a') -> 'exercises') e,
                             jsonb_array_elements(e -> 'repMaxes') r
   where r ->> 'loadKg' is not null),
  6,
  'the owner still sees every load'
);
reset role;

select tests.create_user('pc_counts') as counted \gset
insert into public.rep_maxes (user_id, exercise_id, reps, load_kg, set_id, achieved_at, exact_set_id)
select :'counted', :'bench', r, 50, null, now(), case when r <= 3 then :'set_id'::uuid end from generate_series(1, 5) r;
insert into public.pinned_exercises (user_id, exercise_id, position) values (:'counted', :'squat', 0);
insert into public.bodyweight_rep_records (user_id, exercise_id, max_reps, set_id, achieved_at)
values (:'counted', :'pull_up', 8, null, now());
select results_eq(
  format('select filled_slots, total_slots from private.collection_counts(%L)', :'counted'),
  'values (4, 21)',
  'three exact and two inexact slots, an undone pin and a bodyweight record count 4 of 21'
);

select tests.authenticate_as(:'c');
select is(public.get_profile(:'a'), null, 'a stranger gets no profile');
select is(public.get_collection(:'a'), null, 'a stranger gets no collection');
reset role;
select tests.authenticate_as(:'p');
select is(public.get_profile(:'a'), null, 'a pending requester gets no profile');
select is(public.get_profile(gen_random_uuid()), null, 'a random id gets no profile');
reset role;

select tests.authenticate_as(:'b');
select public.remove_friend(:'a');
select is(public.get_collection(:'a'), null, 'an ex-friend gets no collection');
reset role;

select * from finish();
rollback;
