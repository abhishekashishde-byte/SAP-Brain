-- Wani / SAP-Brain — Phase 5 Supabase security hardening
--
-- Records the live database changes applied through Supabase SQL Editor.
-- Deliberately does not inspect or modify any vault_* object.

begin;

-- ---------------------------------------------------------------------------
-- Signup trigger function
-- Keep a fixed search_path and allow execution only by Supabase Auth.
-- ---------------------------------------------------------------------------
alter function public.handle_new_user()
  set search_path = pg_catalog, public, pg_temp;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

grant execute on function public.handle_new_user()
  to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- User-scoped document retrieval
-- Authenticated callers can search only rows matching auth.uid() in the body.
-- ---------------------------------------------------------------------------
alter function public.match_wani_chunks(
  vector,
  double precision,
  integer
) set search_path = pg_catalog, public, pg_temp;

revoke all on function public.match_wani_chunks(
  vector,
  double precision,
  integer
) from public, anon;

grant execute on function public.match_wani_chunks(
  vector,
  double precision,
  integer
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cross-user document retrieval overload
-- The caller supplies a user id, so execution is restricted to service_role.
-- ---------------------------------------------------------------------------
alter function public.match_wani_chunks(
  vector,
  uuid,
  double precision,
  integer
) set search_path = pg_catalog, public, pg_temp;

revoke all on function public.match_wani_chunks(
  vector,
  uuid,
  double precision,
  integer
) from public, anon, authenticated;

grant execute on function public.match_wani_chunks(
  vector,
  uuid,
  double precision,
  integer
) to service_role;

-- ---------------------------------------------------------------------------
-- User-scoped knowledge retrieval
-- Authenticated callers can search only rows matching auth.uid() in the body.
-- ---------------------------------------------------------------------------
alter function public.match_wani_knowledge(
  vector,
  double precision,
  integer
) set search_path = pg_catalog, public, pg_temp;

revoke all on function public.match_wani_knowledge(
  vector,
  double precision,
  integer
) from public, anon;

grant execute on function public.match_wani_knowledge(
  vector,
  double precision,
  integer
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cross-user knowledge retrieval overload
-- The caller supplies a user id, so execution is restricted to service_role.
-- ---------------------------------------------------------------------------
alter function public.match_wani_knowledge(
  vector,
  uuid,
  double precision,
  integer
) set search_path = pg_catalog, public, pg_temp;

revoke all on function public.match_wani_knowledge(
  vector,
  uuid,
  double precision,
  integer
) from public, anon, authenticated;

grant execute on function public.match_wani_knowledge(
  vector,
  uuid,
  double precision,
  integer
) to service_role;

-- ---------------------------------------------------------------------------
-- Indexed-book summary view
-- Run with caller privileges so underlying grants and RLS are respected.
-- ---------------------------------------------------------------------------
alter view public.sap_books_indexed
  set (security_invoker = true);

revoke all on table public.sap_books_indexed
  from public, anon;

grant select on table public.sap_books_indexed
  to authenticated, service_role;

commit;
