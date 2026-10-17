grant select on public.drop_luck to authenticated;

create policy "read own drop luck" on public.drop_luck
  for select to authenticated using (user_id = (select auth.uid()));
