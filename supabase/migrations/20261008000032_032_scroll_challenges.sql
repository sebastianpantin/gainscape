create type public.challenge_kind as enum ('prescription', 'volume');

create table public.challenges (
  id uuid primary key,
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 1 and 60),
  kind public.challenge_kind not null,
  definition jsonb not null constraint challenge_definition_is_object check (jsonb_typeof(definition) = 'object'),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index challenges_name_unique on public.challenges (lower(name));

alter table public.challenges enable row level security;
grant select on public.challenges to authenticated;
create policy "read challenges" on public.challenges for select to authenticated using (true);

alter table public.items add column grants_challenge_id uuid references public.challenges (id);
alter table public.items drop constraint scrolls_grant_an_exercise;
alter table public.items drop column grants_exercise_id;
alter table public.items add constraint scrolls_grant_a_challenge
  check ((kind = 'scroll') = (grants_challenge_id is not null)) not valid;

alter table public.sessions add column challenge jsonb
  constraint session_challenge_is_object check (challenge is null or jsonb_typeof(challenge) = 'object');

alter type public.ledger_reason add value 'challenge';
