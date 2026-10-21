begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'exercises', 'tracks_distance', 'exercises record whether an activity tracks distance');

select is(
  (select array_agg(key order by key) from public.exercises where not tracks_distance and owner_user_id is null),
  array[
    'arm_circles', 'band_pull_apart', 'cat_cow', 'cossack_squat', 'dynamic_warm_up', 'foam_rolling', 'hip_circles',
    'inchworm', 'leg_swings', 'mobility_flow', 'open_book_rotation', 'scapular_push_up', 'squat_to_stand',
    'static_stretching', 'wall_slide', 'worlds_greatest_stretch', 'yoga'
  ]::text[],
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
