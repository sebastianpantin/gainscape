alter table public.items
  add column skill_id uuid references public.skills (id),
  add constraint items_skill_only_on_pets check (skill_id is null or kind = 'pet');

create unique index items_one_active_pet_per_skill on public.items (skill_id)
  where skill_id is not null and retired_at is null;

alter table public.loot_rolls alter column chance type numeric(11, 10);
