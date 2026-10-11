update public.skills set sort_order = sort_order + 100 where key in ('endurance', 'agility');
update public.skills set sort_order = sort_order - 99 where key in ('endurance', 'agility');
