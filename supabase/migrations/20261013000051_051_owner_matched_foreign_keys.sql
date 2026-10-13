alter table public.sessions add constraint sessions_id_user_id_key unique (id, user_id);
alter table public.sets add constraint sets_id_user_id_key unique (id, user_id);
alter table public.loot_rolls add constraint loot_rolls_id_user_id_key unique (id, user_id);

alter table public.sets
  drop constraint sets_session_id_fkey,
  add constraint sets_session_id_fkey foreign key (session_id, user_id)
    references public.sessions (id, user_id) on delete cascade;

alter table public.events
  drop constraint events_session_id_fkey,
  add constraint events_session_id_fkey foreign key (session_id, user_id)
    references public.sessions (id, user_id) on delete cascade;

alter table public.set_skill_xp
  drop constraint set_skill_xp_set_id_fkey,
  add constraint set_skill_xp_set_id_fkey foreign key (set_id, user_id)
    references public.sets (id, user_id) on delete cascade;

alter table public.drops
  drop constraint drops_loot_roll_id_fkey,
  add constraint drops_loot_roll_id_fkey foreign key (loot_roll_id, user_id)
    references public.loot_rolls (id, user_id) on delete cascade;

alter table public.exercise_maxes
  drop constraint exercise_maxes_source_set_id_fkey,
  add constraint exercise_maxes_source_set_id_fkey foreign key (source_set_id, user_id)
    references public.sets (id, user_id) on delete set null (source_set_id);

alter table public.rep_maxes
  drop constraint rep_maxes_set_id_fkey,
  add constraint rep_maxes_set_id_fkey foreign key (set_id, user_id)
    references public.sets (id, user_id) on delete set null (set_id),
  drop constraint rep_maxes_exact_set_id_fkey,
  add constraint rep_maxes_exact_set_id_fkey foreign key (exact_set_id, user_id)
    references public.sets (id, user_id) on delete set null (exact_set_id);

alter table public.bodyweight_rep_records
  drop constraint bodyweight_rep_records_set_id_fkey,
  add constraint bodyweight_rep_records_set_id_fkey foreign key (set_id, user_id)
    references public.sets (id, user_id) on delete set null (set_id);

alter table public.cardio_records
  drop constraint cardio_records_set_id_fkey,
  add constraint cardio_records_set_id_fkey foreign key (set_id, user_id)
    references public.sets (id, user_id) on delete set null (set_id);
