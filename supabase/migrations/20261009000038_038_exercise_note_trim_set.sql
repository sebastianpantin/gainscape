create or replace function public.save_exercise_note(exercise_id uuid, body text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  trimmed text := regexp_replace(
    coalesce(save_exercise_note.body, ''),
    '^[\t\n\v\f\r \u0085   -     　﻿]+|[\t\n\v\f\r \u0085   -     　﻿]+$',
    '',
    'g'
  );
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if trimmed = '' then
    delete from public.exercise_notes n
    where n.user_id = caller and n.exercise_id = save_exercise_note.exercise_id;
    return null;
  end if;
  insert into public.exercise_notes as n (user_id, exercise_id, body)
  values (caller, save_exercise_note.exercise_id, trimmed)
  on conflict on constraint exercise_notes_pkey do update set body = excluded.body;
  return trimmed;
end;
$$;
