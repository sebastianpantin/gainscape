begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'exercises', 'tracks_distance', 'exercises record whether an activity tracks distance');

select is(
  (select array_agg(key order by key) from public.exercises where not tracks_distance and owner_user_id is null),
  array['dynamic_warm_up', 'foam_rolling', 'mobility_flow', 'static_stretching', 'yoga']::text[],
  'the built-in mobility activities track no distance'
);

select is(
  (select bool_and(tracks_distance) from public.exercises where modality = 'lift'),
  true,
  'lifts keep the default'
);

select throws_ok(
  $$update public.exercises set tracks_distance = false where key = 'running'$$,
  '23514', 'new row for relation "exercises" violates check constraint "exercise_distance_needs_tracking"',
  'an activity with a reference pace must track distance'
);

select lives_ok(
  $$update public.exercises set tracks_distance = false where key = 'walking'$$,
  'an activity without a reference pace may drop distance'
);

select * from finish();
rollback;
