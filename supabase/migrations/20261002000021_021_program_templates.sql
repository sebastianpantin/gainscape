create table public.program_templates (
  key text not null check (key ~ '^[a-z0-9_]+$'),
  version int not null check (version > 0),
  name text not null check (char_length(name) between 1 and 60),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  primary key (key, version)
);

alter table public.program_templates enable row level security;

grant select on public.program_templates to authenticated;

create policy "read program templates" on public.program_templates
  for select to authenticated using (true);
