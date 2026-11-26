alter table public.sets add column pain smallint;
alter table public.sets add constraint set_pain_within_bounds check (pain between 0 and 10);
