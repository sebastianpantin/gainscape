create type public.exercise_measure as enum ('reps', 'time', 'distance');

alter table public.exercises add column measure public.exercise_measure not null default 'reps';
alter table public.exercises add constraint exercise_measure_is_a_lift_measure check (
  measure = 'reps' or modality = 'lift'
);

alter table public.sets drop constraint set_is_lift_xor_cardio;
alter table public.sets add constraint set_is_lift_cardio_or_hold check (
  (
    reps is not null and weight_kg is not null and effective_load_kg is not null
    and num_nulls(duration_s, distance_m, interval_work_s, interval_rest_s, interval_rounds, counted_work_s) = 6
    and not pace_flagged
  )
  or (
    duration_s is not null and counted_work_s is not null
    and reps is null and weight_kg is null and effective_load_kg is null
    and rir is null and effective_reps = 0 and not is_warmup
  )
  or (
    reps is null and weight_kg is not null and effective_load_kg is not null
    and num_nulls(duration_s, distance_m) = 1
    and num_nulls(interval_work_s, interval_rest_s, interval_rounds, counted_work_s) = 4
    and coalesce(duration_s between 1 and 3600, true)
    and coalesce(distance_m between 1 and 10000, true)
    and not pace_flagged and not is_warmup
  )
);

alter table public.sets drop constraint cardio_duration_within_bounds;
alter table public.sets add constraint cardio_duration_within_bounds check (
  counted_work_s is null
  or case
    when interval_rounds is null then duration_s between 60 and 14400 and counted_work_s = duration_s
    else duration_s between 5 and 14400
      and duration_s = interval_rounds * interval_work_s + (interval_rounds - 1) * interval_rest_s
      and counted_work_s = interval_rounds * interval_work_s
  end
);

alter table public.sets drop constraint effort_matches_set_kind;
alter table public.sets add constraint effort_matches_set_kind check (
  case
    when counted_work_s is not null then
      effort_input_type is null or (effort_input_type = 'cardio' and effort_value in (1, 2, 3, 4))
    when reps is null then effort_input_type is null or effort_input_type = 'level'
    else effort_input_type is distinct from 'cardio'
  end
);
