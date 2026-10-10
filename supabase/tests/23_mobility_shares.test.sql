begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select id as yoga from public.exercises where key = 'yoga' \gset
select id as running from public.exercises where key = 'running' \gset
select id as mobility from public.skills where key = 'mobility' \gset
select id as endurance from public.skills where key = 'endurance' \gset

select is(
  (select count(*)::int from public.exercise_skills es
   where es.exercise_id in (select exercise_id from public.exercise_skills where skill_id = :'mobility')
     and es.skill_id <> :'mobility'),
  0,
  'no seeded exercise shares Mobility with another skill'
);

select throws_ok(
  format($$
    update public.exercise_skills set share_bp = 5000 where exercise_id = %1$L;
    insert into public.exercise_skills (exercise_id, skill_id, share_bp) values (%1$L, %2$L, 5000);
  $$, :'yoga', :'endurance'),
  'P0001', 'invalid_exercise',
  'a Mobility activity cannot also train another skill'
);

select throws_ok(
  format($$
    update public.exercise_skills set share_bp = 5000 where exercise_id = %1$L;
    insert into public.exercise_skills (exercise_id, skill_id, share_bp) values (%1$L, %2$L, 5000);
  $$, :'running', :'mobility'),
  'P0001', 'invalid_exercise',
  'another activity cannot add a Mobility share'
);

select lives_ok(
  format($$
    delete from public.exercise_skills where exercise_id = %1$L;
    insert into public.exercise_skills (exercise_id, skill_id, share_bp) values (%1$L, %2$L, 10000);
  $$, :'running', :'mobility'),
  'an activity may train Mobility alone'
);

select * from finish();
rollback;
