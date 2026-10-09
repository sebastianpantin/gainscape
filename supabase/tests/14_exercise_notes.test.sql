begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select tests.create_user('note_alpha') as a \gset
select tests.create_user('note_bravo') as b \gset
select id as bench from public.exercises where key = 'barbell_bench_press' \gset
select id as squat from public.exercises where key = 'back_squat' \gset
select gen_random_uuid() as custom_b \gset
insert into public.exercises (id, owner_user_id, name, load_type, equipment)
values (:'custom_b', :'b', 'Bravo private lift', 'external', 'other');

select has_table('public', 'exercise_notes', 'exercise_notes exists');
select col_is_pk('public', 'exercise_notes', array['user_id', 'exercise_id'], 'one note per user and exercise');
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.exercise_notes'::regclass),
  'exercise_notes has row level security'
);
select ok(
  not has_function_privilege('anon', 'public.save_exercise_note(uuid, text)', 'execute'),
  'anon cannot save a note'
);
select ok(
  has_function_privilege('authenticated', 'public.save_exercise_note(uuid, text)', 'execute'),
  'authenticated can save a note'
);
select throws_ok(
  format('select public.save_exercise_note(%L, %L)', :'bench', 'Seat 4'),
  '42501', 'not_authenticated', 'saving a note needs a signed-in user'
);

select tests.authenticate_as(:'a');
select is(
  public.save_exercise_note(:'bench', E'  Seat 4\nwide grip  '),
  E'Seat 4\nwide grip',
  'saving a note stores and returns the trimmed text'
);
select is(
  public.save_exercise_note(:'bench', E'\uFEFF\u00A0Seat 4\u0085\u3000'),
  'Seat 4',
  'saving a note trims the same whitespace set as the web app, including U+FEFF and U+0085'
);
select is(
  public.save_exercise_note(:'bench', E'\u200BSeat 4'),
  E'\u200BSeat 4',
  'a zero width space is not whitespace and stays in the note'
);
select is(
  public.save_exercise_note(:'bench', 'Seat 5'),
  'Seat 5',
  'saving again replaces the note'
);
select is(
  (select array_agg(body) from public.exercise_notes where user_id = :'a'),
  array['Seat 5'],
  'the owner reads one note for the exercise'
);
select throws_ok(
  format('select public.save_exercise_note(%L, %L)', :'squat', repeat('x', 501)),
  '23514', null, 'a note longer than 500 characters is refused'
);
select lives_ok(
  format('select public.save_exercise_note(%L, %L)', :'squat', repeat('x', 500)),
  'a note of 500 characters is saved'
);
select throws_ok(
  format('select public.save_exercise_note(%L, %L)', :'custom_b', 'Not mine'),
  '42501', null, 'a note on another user''s custom exercise is refused'
);
select throws_ok(
  format('insert into public.exercise_notes (user_id, exercise_id, body) values (%L, %L, %L)', :'b', :'bench', 'Forged'),
  '42501', null, 'a user cannot write a note for another user'
);
select throws_ok(
  format('update public.exercise_notes set updated_at = %L where user_id = %L', '2000-01-01', :'a'),
  '42501', null, 'a client cannot set when a note was updated'
);
select is(public.save_exercise_note(:'squat', '   '), null, 'a blank note returns null');
select is(
  (select count(*)::int from public.exercise_notes where user_id = :'a' and exercise_id = :'squat'),
  0,
  'a blank note deletes the note'
);
reset role;

select tests.authenticate_as(:'b');
select is((select count(*)::int from public.exercise_notes where user_id = :'a'), 0, 'another user reads none of the notes');
select lives_ok(
  format('update public.exercise_notes set body = %L where user_id = %L', 'Hijacked', :'a'),
  'another user''s edit of the note runs against no rows'
);
select lives_ok(
  format('delete from public.exercise_notes where user_id = %L', :'a'),
  'another user''s delete of the note runs against no rows'
);
select is(public.save_exercise_note(:'bench', 'Bravo seat 2'), 'Bravo seat 2', 'another user keeps their own note');
select lives_ok(
  format('select public.save_exercise_note(%L, %L)', :'custom_b', 'Mine'),
  'a user can note their own custom exercise'
);
reset role;

select is(
  (select body from public.exercise_notes where user_id = :'a' and exercise_id = :'bench'),
  'Seat 5',
  'the owner''s note survives the other user''s edit and delete'
);

delete from public.exercises where id = :'custom_b';
select is(
  (select count(*)::int from public.exercise_notes where exercise_id = :'custom_b'),
  0,
  'deleting an exercise deletes its notes'
);

select * from finish();
rollback;
