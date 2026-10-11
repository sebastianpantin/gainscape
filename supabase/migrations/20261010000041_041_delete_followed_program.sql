create or replace function public.delete_program(program_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform 1 from public.profiles p where p.id = caller for update;
  update public.program_enrollments e set ended_at = now()
  where e.user_id = caller
    and e.ended_at is null
    and exists (
      select 1 from public.program_templates t
      join public.programs pr on pr.id = t.source_program_id
      where t.key = e.template_key
        and t.version = e.template_version
        and t.source_program_id = delete_program.program_id
        and pr.owner_user_id = caller
    );
  delete from public.programs p where p.id = delete_program.program_id and p.owner_user_id = caller;
  if not found then
    raise exception 'program_not_found' using errcode = 'P0001';
  end if;
end;
$$;
