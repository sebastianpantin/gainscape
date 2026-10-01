begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select array_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p') and n.nspname = 'public' and not c.relrowsecurity),
  null,
  'every table in public has row level security'
);

select is(
  (select array_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p') and n.nspname = 'private' and not c.relrowsecurity),
  null,
  'every table in private has row level security'
);

select is(
  (select array_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p', 'v', 'm') and n.nspname in ('public', 'private')
     and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')),
  null,
  'anon has no table privilege in public or private'
);

select results_eq(
  $$select g.table_schema::text collate "default", g.table_name::text collate "default",
           g.privilege_type::text collate "default"
    from information_schema.role_table_grants g
    where g.grantee = 'authenticated' and g.table_schema in ('public', 'private')
    order by 1, 2, 3$$,
  $$select 'public'::text, t.table_name::text, t.privilege_type::text
    from (
      select c.relname::text collate "default" as table_name, 'SELECT' as privilege_type
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname = 'public'
        and c.relname not in ('events', 'reactions', 'friendships', 'drop_luck')
      union all
      values ('pinned_exercises', 'INSERT'), ('pinned_exercises', 'DELETE')
    ) t
    order by 1, 2, 3$$,
  'authenticated has exactly the allowlisted table privileges'
);

select results_eq(
  $$select p.table_name::text collate "default", p.column_name::text collate "default"
    from information_schema.column_privileges p
    where p.grantee = 'authenticated' and p.table_schema in ('public', 'private') and p.privilege_type = 'UPDATE'
    order by 1, 2$$,
  $$values
    ('pinned_exercises', 'position'),
    ('profile_private', 'birth_year'),
    ('profile_private', 'bodyweight_kg'),
    ('profile_private', 'effort_input_mode'),
    ('profile_private', 'height_cm'),
    ('profile_private', 'unit_pref'),
    ('profiles', 'badge_color'),
    ('profiles', 'bio'),
    ('profiles', 'display_name'),
    ('profiles', 'show_bodyweight'),
    ('profiles', 'show_weights'),
    ('profiles', 'training_focus'),
    ('profiles', 'training_since')$$,
  'authenticated updates exactly the allowlisted columns'
);

select is(
  (select array_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by n.nspname, p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not coalesce('search_path=""' = any(p.proconfig), false)),
  null,
  'every security definer function in public and private pins search_path to empty'
);

select is(
  (select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and pg_get_userbyid(p.proowner) <> 'postgres'),
  null,
  'every function in public is owned by postgres'
);

select isnt(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef),
  0,
  'the definer check sees the definer functions'
);

select * from finish();
rollback;
