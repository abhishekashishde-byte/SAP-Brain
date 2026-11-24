-- READ ONLY. Shows, for every table in the public schema: is row-level security on,
-- which policies exist, and what the public (anon) and logged-in (authenticated)
-- roles are allowed to do. Run in Supabase → SQL Editor and send the result to Claude.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  coalesce((select string_agg(p.policyname || ' [' || p.cmd || ' to ' || array_to_string(p.roles, ',') || '] using ' || coalesce(p.qual, '-'), E'\n')
            from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname), '(none)') as policies,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert,
  has_table_privilege('authenticated', c.oid, 'DELETE') as auth_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;
