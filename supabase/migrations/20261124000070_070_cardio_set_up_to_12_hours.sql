alter table public.sets drop constraint cardio_duration_within_bounds;
alter table public.sets add constraint cardio_duration_within_bounds check (
  counted_work_s is null
  or case
    when interval_rounds is null then duration_s between 60 and 43200 and counted_work_s = duration_s
    else duration_s between 5 and 14400
      and duration_s = interval_rounds * interval_work_s + (interval_rounds - 1) * interval_rest_s
      and counted_work_s = interval_rounds * interval_work_s
  end
);
