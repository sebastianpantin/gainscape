create table private.rate_limit_rules (
  bucket text primary key check (bucket ~ '^[a-z0-9_]+$'),
  max_hits int not null check (max_hits > 0),
  window_seconds int not null check (window_seconds between 1 and 604800)
);

insert into private.rate_limit_rules (bucket, max_hits, window_seconds) values
  ('session_create_hour', 20, 3600),
  ('session_create_day', 60, 86400),
  ('session_edit_hour', 60, 3600),
  ('session_delete_hour', 30, 3600),
  ('export_data_hour', 5, 3600),
  ('delete_account_hour', 5, 3600),
  ('friend_request_minute', 30, 60),
  ('friend_request_day', 100, 86400),
  ('gz_minute', 120, 60);

create table private.rate_limit_hits (
  bucket text not null references private.rate_limit_rules (bucket) on delete cascade,
  subject uuid not null references public.profiles (id) on delete cascade,
  window_start timestamptz not null,
  hits int not null check (hits > 0),
  primary key (bucket, subject, window_start)
);

alter table private.rate_limit_rules enable row level security;
alter table private.rate_limit_hits enable row level security;

create function private.take_rate_limit(bucket_name text, subject_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  rule_max_hits int;
  rule_window_seconds int;
  window_begin timestamptz;
  taken int;
begin
  select r.max_hits, r.window_seconds into rule_max_hits, rule_window_seconds
  from private.rate_limit_rules r
  where r.bucket = take_rate_limit.bucket_name;
  if not found then
    raise exception 'unknown_rate_limit_bucket' using errcode = 'invalid_parameter_value';
  end if;

  window_begin := to_timestamp(floor(extract(epoch from now()) / rule_window_seconds) * rule_window_seconds);

  insert into private.rate_limit_hits as h (bucket, subject, window_start, hits)
  values (take_rate_limit.bucket_name, take_rate_limit.subject_id, window_begin, 1)
  on conflict (bucket, subject, window_start) do update set hits = h.hits + 1
  returning h.hits into taken;

  delete from private.rate_limit_hits h
  where h.bucket = take_rate_limit.bucket_name
    and h.subject = take_rate_limit.subject_id
    and h.window_start < window_begin;

  if taken > rule_max_hits then
    raise exception 'rate_limited' using
      errcode = 'PT429',
      detail = json_build_object(
        'bucket', take_rate_limit.bucket_name,
        'retryAfterSeconds', greatest(1, ceil(extract(epoch from
          (window_begin + make_interval(secs => rule_window_seconds) - clock_timestamp()))))::int
      )::text;
  end if;
end;
$$;

revoke execute on function private.take_rate_limit(text, uuid) from public, anon, authenticated;

create type public.event_type as enum ('pr', 'level_up', 'level_99', 'drop');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  event_key text not null check (event_key ~ '^(pr|level|drop):[a-z0-9_-]+$'),
  type public.event_type not null,
  set_id uuid,
  occurred_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, event_key)
);

create index events_feed_order on public.events (user_id, occurred_at desc, id desc);

alter table public.events enable row level security;
