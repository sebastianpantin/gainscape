alter table public.exercises add column tracks_distance boolean not null default true;

alter table public.exercises add constraint exercise_distance_needs_tracking check (
  tracks_distance or (modality = 'cardio' and reference_pace_s_per_km is null and record_min_distance_m is null)
);
