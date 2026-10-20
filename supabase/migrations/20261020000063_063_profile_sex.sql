alter table public.profile_private
  add column sex text constraint profile_sex_is_known check (sex in ('male', 'female'));

grant update (sex) on public.profile_private to authenticated;
