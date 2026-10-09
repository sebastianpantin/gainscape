create index if not exists sessions_by_user_derived_version on public.sessions (user_id, derived_balance_version)
  where not history_only;
