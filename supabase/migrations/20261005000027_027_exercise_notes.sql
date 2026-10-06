create table public.exercise_notes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index exercise_notes_by_exercise on public.exercise_notes (exercise_id);

alter table public.exercise_notes enable row level security;

grant select, insert, delete on public.exercise_notes to authenticated;
grant update (body) on public.exercise_notes to authenticated;

create policy "read own exercise notes" on public.exercise_notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "note visible exercises" on public.exercise_notes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.exercises e where e.id = exercise_id)
  );
create policy "edit own exercise notes" on public.exercise_notes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own exercise notes" on public.exercise_notes
  for delete to authenticated using (user_id = (select auth.uid()));

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values ('exercise_note_save_hour', 120, 3600);

create trigger limit_client_exercise_notes
before insert or update or delete on public.exercise_notes
for each row execute function private.limit_client_write('exercise_note_save_hour', 'exercise_id');

create function private.touch_exercise_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.touch_exercise_note() from public, anon, authenticated;

create trigger touch_exercise_note
before update on public.exercise_notes
for each row execute function private.touch_exercise_note();

create function public.save_exercise_note(exercise_id uuid, body text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  trimmed text := regexp_replace(coalesce(save_exercise_note.body, ''), '^\s+|\s+$', '', 'g');
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

revoke execute on function public.save_exercise_note(uuid, text) from public, anon;
grant execute on function public.save_exercise_note(uuid, text) to authenticated;
