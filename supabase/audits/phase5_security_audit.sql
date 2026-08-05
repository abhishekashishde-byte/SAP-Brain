-- Wani / SAP-Brain — Phase 5 read-only security audit
--
-- Purpose:
--   Capture the exact live definitions and privileges of the database objects
--   previously flagged by Supabase security advisors before changing them.
--
-- Safety:
--   * READ ONLY — this script does not create, alter, grant, revoke, insert,
--     update, or delete anything.
--   * Deliberately excludes every object whose name begins with "vault".
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- Then download/copy the single JSON result row.

with target_functions as (
  select
    p.oid,
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_result(p.oid) as result_type,
    l.lanname as language,
    owner_role.rolname as owner,
    p.prosecdef as security_definer,
    p.provolatile as volatility,
    p.proconfig as runtime_config,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
    case
      when exists (select 1 from pg_roles where rolname = 'supabase_auth_admin')
      then has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')
      else null
    end as auth_admin_can_execute,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  join pg_roles owner_role on owner_role.oid = p.proowner
  where n.nspname = 'public'
    and p.proname in (
      'handle_new_user',
      'match_wani_chunks',
      'match_wani_knowledge'
    )
),
view_details as (
  select
    c.oid,
    n.nspname as schema_name,
    c.relname as view_name,
    owner_role.rolname as owner,
    c.relkind,
    c.reloptions,
    has_table_privilege('anon', c.oid, 'SELECT') as anon_can_select,
    has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select,
    has_table_privilege('service_role', c.oid, 'SELECT') as service_role_can_select,
    pg_get_viewdef(c.oid, true) as definition
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles owner_role on owner_role.oid = c.relowner
  where n.nspname = 'public'
    and c.relname = 'sap_books_indexed'
    and c.relkind in ('v', 'm')
),
view_dependencies as (
  select distinct
    source_ns.nspname as source_schema,
    source.relname as source_relation,
    source.relkind,
    source.relrowsecurity as rls_enabled,
    source.relforcerowsecurity as force_rls,
    has_table_privilege('anon', source.oid, 'SELECT') as anon_can_select,
    has_table_privilege('authenticated', source.oid, 'SELECT') as authenticated_can_select,
    has_table_privilege('service_role', source.oid, 'SELECT') as service_role_can_select
  from view_details v
  join pg_rewrite rw on rw.ev_class = v.oid
  join pg_depend dep on dep.objid = rw.oid
  join pg_class source on source.oid = dep.refobjid
  join pg_namespace source_ns on source_ns.oid = source.relnamespace
  where source.oid <> v.oid
    and source_ns.nspname not in ('pg_catalog', 'information_schema')
    and source.relname not ilike 'vault%'
),
trigger_details as (
  select
    event_object_schema,
    event_object_table,
    trigger_schema,
    trigger_name,
    event_manipulation,
    action_timing,
    action_orientation,
    action_statement
  from information_schema.triggers
  where action_statement ilike '%handle_new_user%'
    and event_object_table not ilike 'vault%'
),
policies as (
  select
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      select source_relation from view_dependencies
    )
    and tablename not ilike 'vault%'
),
related_grants as (
  select
    table_schema,
    table_name,
    grantee,
    privilege_type,
    is_grantable
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      select source_relation from view_dependencies
      union all
      select 'sap_books_indexed'
    )
    and grantee in ('anon', 'authenticated', 'service_role')
    and table_name not ilike 'vault%'
)
select jsonb_pretty(
  jsonb_build_object(
    'generated_at', now(),
    'database_version', version(),
    'target_functions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'schema', schema_name,
            'name', function_name,
            'identity_arguments', identity_arguments,
            'result_type', result_type,
            'language', language,
            'owner', owner,
            'security_definer', security_definer,
            'volatility', volatility,
            'runtime_config', runtime_config,
            'anon_can_execute', anon_can_execute,
            'authenticated_can_execute', authenticated_can_execute,
            'service_role_can_execute', service_role_can_execute,
            'auth_admin_can_execute', auth_admin_can_execute,
            'definition', definition
          ) order by function_name, identity_arguments
        )
        from target_functions
      ),
      '[]'::jsonb
    ),
    'sap_books_indexed', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'schema', schema_name,
            'name', view_name,
            'owner', owner,
            'relation_kind', relkind,
            'options', reloptions,
            'anon_can_select', anon_can_select,
            'authenticated_can_select', authenticated_can_select,
            'service_role_can_select', service_role_can_select,
            'definition', definition
          )
        )
        from view_details
      ),
      '[]'::jsonb
    ),
    'view_dependencies', coalesce(
      (
        select jsonb_agg(to_jsonb(view_dependencies) order by source_schema, source_relation)
        from view_dependencies
      ),
      '[]'::jsonb
    ),
    'dependent_table_policies', coalesce(
      (
        select jsonb_agg(to_jsonb(policies) order by tablename, policyname)
        from policies
      ),
      '[]'::jsonb
    ),
    'related_table_grants', coalesce(
      (
        select jsonb_agg(to_jsonb(related_grants) order by table_name, grantee, privilege_type)
        from related_grants
      ),
      '[]'::jsonb
    ),
    'handle_new_user_triggers', coalesce(
      (
        select jsonb_agg(to_jsonb(trigger_details) order by event_object_schema, event_object_table, trigger_name)
        from trigger_details
      ),
      '[]'::jsonb
    ),
    'vault_objects_examined', false,
    'changes_made', false
  )
) as phase5_security_audit;
