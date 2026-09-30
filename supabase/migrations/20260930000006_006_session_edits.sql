alter table public.sessions add column revision int not null default 0 check (revision >= 0);

alter table public.sets drop constraint sets_session_id_position_key;
alter table public.sets add constraint sets_session_id_position_key
  unique (session_id, position) deferrable initially immediate;

create table public.deleted_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  deleted_at timestamptz not null default now()
);
create index deleted_sessions_by_user on public.deleted_sessions (user_id, deleted_at desc);

alter table public.deleted_sessions enable row level security;
grant select on public.deleted_sessions to authenticated;
create policy "read own deleted sessions" on public.deleted_sessions
  for select to authenticated using (user_id = (select auth.uid()));
