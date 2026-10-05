alter table public.sessions
  add column session_rpe smallint constraint session_rpe_is_one_to_ten check (session_rpe between 1 and 10);
