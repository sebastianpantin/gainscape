create type public.cardio_record_kind as enum ('distance', 'pace', 'duration');

create table public.cardio_records (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  kind public.cardio_record_kind not null,
  value numeric(10, 1) not null check (value > 0),
  set_id uuid references public.sets (id) on delete set null,
  achieved_at timestamptz not null,
  primary key (user_id, exercise_id, kind)
);

alter table public.cardio_records enable row level security;

grant select on public.cardio_records to authenticated;

create policy "read own cardio records" on public.cardio_records
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.feed_payload(
  event_type public.event_type,
  stored jsonb,
  hide_loads boolean,
  hide_total boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case feed_payload.event_type
    when 'pr' then (
      select case when feed_payload.stored ->> 'kind' = 'cardio' then
          jsonb_build_object(
            'exerciseId', feed_payload.stored -> 'exerciseId',
            'exerciseName', case when x.owner_user_id is null then x.name else private.custom_exercise_label() end,
            'kind', 'cardio',
            'paceUnit', x.pace_unit,
            'recordKinds', feed_payload.stored -> 'recordKinds',
            'countedWorkS', feed_payload.stored -> 'countedWorkS',
            'previousCountedWorkS', feed_payload.stored -> 'previousCountedWorkS',
            'weightsHidden', feed_payload.hide_loads)
          || case when feed_payload.hide_loads then '{}'::jsonb else jsonb_build_object(
            'distanceM', feed_payload.stored -> 'distanceM',
            'previousDistanceM', feed_payload.stored -> 'previousDistanceM',
            'paceSPerKm', feed_payload.stored -> 'paceSPerKm',
            'previousPaceSPerKm', feed_payload.stored -> 'previousPaceSPerKm') end
        else
          jsonb_build_object(
            'exerciseId', feed_payload.stored -> 'exerciseId',
            'exerciseName', case when x.owner_user_id is null then x.name else private.custom_exercise_label() end,
            'loadType', x.load_type,
            'kind', feed_payload.stored -> 'kind',
            'reps', feed_payload.stored -> 'reps',
            'previousReps', feed_payload.stored -> 'previousReps',
            'weightsHidden', feed_payload.hide_loads)
          || case when feed_payload.hide_loads then '{}'::jsonb else jsonb_build_object(
            'loadKg', feed_payload.stored -> 'loadKg',
            'previousLoadKg', feed_payload.stored -> 'previousLoadKg') end
          || case when feed_payload.hide_total or jsonb_typeof(feed_payload.stored -> 'totalLoadKg') is distinct from 'number'
               then '{}'::jsonb
               else jsonb_build_object('totalLoadKg', feed_payload.stored -> 'totalLoadKg') end
        end
      from public.exercises x
      where x.id = (feed_payload.stored ->> 'exerciseId')::uuid)
    when 'drop' then (
      select jsonb_build_object(
        'dropId', feed_payload.stored -> 'dropId',
        'itemId', i.id,
        'itemKey', i.key,
        'itemName', i.name,
        'iconKey', i.icon_key,
        'tier', i.tier,
        'rarity', i.rarity,
        'quantity', feed_payload.stored -> 'quantity',
        'source', feed_payload.stored -> 'source')
      from public.items i
      where i.id = (feed_payload.stored ->> 'itemId')::uuid)
    else (
      select jsonb_build_object(
        'skill', s.key,
        'skillName', s.name,
        'from', feed_payload.stored -> 'from',
        'to', feed_payload.stored -> 'to')
      from public.skills s
      where s.key = feed_payload.stored ->> 'skill')
  end;
$$;
