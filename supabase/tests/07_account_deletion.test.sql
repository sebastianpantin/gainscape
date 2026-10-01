begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create function tests.rows_referencing(target uuid)
returns table (column_ref text, row_count int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reference record;
begin
  for reference in
    select n.nspname::text as sch, c.relname::text as rel, a.attname::text as col
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_class c on c.oid = k.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_class f on f.oid = k.confrelid
    join pg_catalog.pg_namespace fn on fn.oid = f.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = any(k.conkey)
    where k.contype = 'f' and n.nspname in ('public', 'private')
      and ((fn.nspname = 'public' and f.relname = 'profiles') or (fn.nspname = 'auth' and f.relname = 'users'))
    order by 1, 2, 3
  loop
    column_ref := reference.sch || '.' || reference.rel || '.' || reference.col;
    execute format('select count(*)::int from %I.%I where %I = $1', reference.sch, reference.rel, reference.col)
      into row_count using rows_referencing.target;
    return next;
  end loop;
end;
$$;

select tests.create_user('del_owner') as owner \gset
select tests.create_user('del_friend') as friend \gset
select tests.create_user('del_fan') as fan \gset
select tests.create_user('del_bystander') as bystander \gset
select tests.give_everything(:'owner', :'friend');
select tests.give_everything(:'bystander', :'fan');
insert into public.friendships (requester_id, addressee_id, status) values (:'fan', :'owner', 'pending');
insert into public.reactions (event_id, user_id)
select e.id, :'friend' from public.events e where e.user_id = :'owner';

create temporary table bystander_before as select * from tests.rows_referencing(:'bystander');

select is(
  (select array_agg(r.column_ref order by r.column_ref) from tests.rows_referencing(:'owner') r where r.row_count = 0),
  null,
  'before deletion the owner has rows behind every foreign key to their account'
);
select ok(
  (select count(*) from tests.rows_referencing(:'owner')) >= 25,
  'the check covers every column that references an account'
);

delete from auth.users where id = :'owner';

select is(
  (select array_agg(r.column_ref || '=' || r.row_count order by r.column_ref) from tests.rows_referencing(:'owner') r
   where r.row_count > 0),
  null,
  'deleting the auth user leaves no row that references the account'
);
select is((select count(*)::int from auth.users where id = :'owner'), 0, 'the auth user is gone');
select is(
  (select count(*)::int from public.reactions r where r.user_id = :'friend'),
  0,
  'a friend''s reactions on the owner''s events are gone'
);
select results_eq(
  'select column_ref, row_count from tests.rows_referencing(' || quote_literal(:'bystander') || ') order by 1',
  'select column_ref, row_count from bystander_before order by 1',
  'a bystander keeps every row'
);

select * from finish();
rollback;
